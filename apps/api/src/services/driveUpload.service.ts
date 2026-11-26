import { config } from '../config/env.js';
import { getGoogleAccessToken, hasDriveFileScope } from '../routes/googleDrive.js';

const TELEGRAM_BOT_MAX_BYTES = 20 * 1024 * 1024; // 20MB Telegram Bot API limit

export async function downloadTelegramFileSafe(
  fileId: string,
  botToken = config.TELEGRAM_BOT_TOKEN
): Promise<{ ok: boolean; buffer?: Buffer; filePath?: string; error?: string }> {
  if (!botToken) {
    return { ok: false, error: 'Telegram bot token is not configured.' };
  }
  const metaRes = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(botToken)}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!metaRes.ok) {
    return { ok: false, error: `Telegram getFile failed (${metaRes.status})` };
  }
  const metaJson = (await metaRes.json()) as { ok?: boolean; result?: { file_path?: string; file_size?: number } };
  const filePath = metaJson.result?.file_path;
  const fileSize = metaJson.result?.file_size || 0;
  if (!filePath) return { ok: false, error: 'Telegram did not return a file_path.' };
  if (fileSize > TELEGRAM_BOT_MAX_BYTES) {
    return { ok: false, error: 'File exceeds Telegram Bot API 20 MB download limit.' };
  }

  const downloadUrl = new URL(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (downloadUrl.hostname !== 'api.telegram.org' || downloadUrl.protocol !== 'https:') {
    return { ok: false, error: 'Blocked non-Telegram file host.' };
  }

  const fileRes = await fetch(downloadUrl.toString(), { signal: AbortSignal.timeout(12000) });
  if (!fileRes.ok) {
    return { ok: false, error: `Failed to download Telegram file (${fileRes.status})` };
  }
  const arr = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arr);
  if (buffer.byteLength > TELEGRAM_BOT_MAX_BYTES) {
    return { ok: false, error: 'File exceeds 20 MB limit.' };
  }
  return { ok: true, buffer, filePath };
}

export interface DriveUploadResult {
  ok: boolean;
  fileId?: string;
  name?: string;
  folderName?: string;
  sizeBytes?: number;
  webViewLink?: string;
  errorCode?: 'MISSING_DRIVE_FILE_SCOPE' | 'NOT_CONNECTED' | 'DUPLICATE_FILE' | 'FOLDER_CREATE_CONFIRM' | 'UPLOAD_FAILED';
  existingFileId?: string;
  error?: string;
}

async function findDriveFolder(token: string, folderName: string): Promise<string | null> {
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  return json.files?.[0]?.id || null;
}

async function createDriveFolder(token: string, folderName: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: string };
  return json.id || null;
}

export async function uploadFileToDrive(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folderName?: string;
  allowCreateFolder?: boolean;
  replaceExisting?: boolean;
  keepBoth?: boolean;
  userId?: string;
}): Promise<DriveUploadResult> {
  const token = await getGoogleAccessToken(input.userId);
  if (!token) {
    return { ok: false, errorCode: 'NOT_CONNECTED', error: 'Google is not connected.' };
  }
  const hasScope = await hasDriveFileScope(input.userId);
  if (!hasScope) {
    return {
      ok: false,
      errorCode: 'MISSING_DRIVE_FILE_SCOPE',
      error: 'Google Drive upload permission (drive.file) is missing. Please reconnect Google to allow saving files.',
    };
  }

  const targetFolder = input.folderName?.trim() || 'Karen Uploads';
  let folderId = await findDriveFolder(token, targetFolder);
  if (!folderId) {
    if (targetFolder !== 'Karen Uploads' && !input.allowCreateFolder) {
      return {
        ok: false,
        errorCode: 'FOLDER_CREATE_CONFIRM',
        folderName: targetFolder,
        error: `Folder "${targetFolder}" does not exist in Drive. Create it?`,
      };
    }
    folderId = await createDriveFolder(token, targetFolder);
  }

  // Duplicate check (same name + size)
  if (!input.replaceExisting && !input.keepBoth && folderId) {
    const dupQ = `name = '${input.fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
    const dupRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(dupQ)}&fields=files(id,name,size)`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
    );
    if (dupRes.ok) {
      const dupJson = (await dupRes.json()) as { files?: Array<{ id: string; size?: string }> };
      const match = dupJson.files?.find((f) => Number(f.size || 0) === input.buffer.byteLength);
      if (match) {
        return {
          ok: false,
          errorCode: 'DUPLICATE_FILE',
          existingFileId: match.id,
          name: input.fileName,
          folderName: targetFolder,
          error: `A file named "${input.fileName}" with the same size already exists in "${targetFolder}". Replace it or keep both?`,
        };
      }
    }
  }

  const istNow = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const metadata = {
    name: input.fileName,
    description: `Source: Karen AI / Telegram | Uploaded: ${istNow} IST`,
    ...(folderId ? { parents: [folderId] } : {}),
  };

  const boundary = `karen_drive_${Date.now()}`;
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaHeader = `--${boundary}\r\nContent-Type: ${input.mimeType || 'application/octet-stream'}\r\n\r\n`;
  const footer = `\r\n--${boundary}--`;
  const multipartBody = Buffer.concat([
    Buffer.from(metaPart, 'utf8'),
    Buffer.from(mediaHeader, 'utf8'),
    input.buffer,
    Buffer.from(footer, 'utf8'),
  ]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    return {
      ok: false,
      errorCode: 'UPLOAD_FAILED',
      error: `Drive upload failed (${uploadRes.status}): ${errText.slice(0, 140)}`,
    };
  }

  const uploaded = (await uploadRes.json()) as { id: string; name: string; size?: string; webViewLink?: string };
  return {
    ok: true,
    fileId: uploaded.id,
    name: uploaded.name,
    folderName: targetFolder,
    sizeBytes: Number(uploaded.size || input.buffer.byteLength),
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}
