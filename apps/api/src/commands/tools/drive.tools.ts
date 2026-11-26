import { z } from 'zod';
import { downloadTelegramFileSafe, uploadFileToDrive } from '../../services/driveUpload.service.js';
import type { CommandToolDef } from '../types.js';

export const driveUploadTool: CommandToolDef<{
  fileName?: string;
  folder?: string;
  replaceExisting?: boolean;
  keepBoth?: boolean;
  allowCreateFolder?: boolean;
}> = {
  name: 'drive_upload',
  category: 'drive',
  description: 'Save the just-uploaded Telegram/web file to Google Drive (supports folder name, duplicate handling, and scope detection).',
  requiresConfirmation: false,
  inputSchema: z.object({
    fileName: z.string().optional(),
    folder: z.string().optional(),
    replaceExisting: z.boolean().optional(),
    keepBoth: z.boolean().optional(),
    allowCreateFolder: z.boolean().optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      fileName: { type: 'string' },
      folder: { type: 'string' },
      replaceExisting: { type: 'boolean' },
      keepBoth: { type: 'boolean' },
      allowCreateFolder: { type: 'boolean' },
    },
  },
  async execute(args, ctx) {
    const fileRef = ctx.lastUploadedFile;
    if (!fileRef) {
      return {
        ok: true,
        summary: 'Please upload or send the file first, then tell me to save it to Drive.',
        needsClarification: {
          actionType: 'drive_upload',
          question: 'Please send the file you want me to save to Google Drive.',
          partialPayload: { ...args },
        },
      };
    }

    let buffer: Buffer | undefined;
    if (fileRef.dataBase64) {
      buffer = Buffer.from(fileRef.dataBase64, 'base64');
    } else if (fileRef.source === 'telegram' && fileRef.fileId) {
      const dl = await downloadTelegramFileSafe(fileRef.fileId);
      if (!dl.ok || !dl.buffer) {
        return { ok: false, summary: dl.error || 'Could not download file from Telegram.' };
      }
      buffer = dl.buffer;
    }

    if (!buffer) {
      return { ok: false, summary: 'Uploaded file data is unavailable.' };
    }

    const res = await uploadFileToDrive({
      buffer,
      fileName: args.fileName || fileRef.fileName,
      mimeType: fileRef.mimeType,
      folderName: args.folder,
      allowCreateFolder: args.allowCreateFolder,
      replaceExisting: args.replaceExisting,
      keepBoth: args.keepBoth,
      userId: ctx.userId,
    });

    if (!res.ok) {
      if (res.errorCode === 'MISSING_DRIVE_FILE_SCOPE' || res.errorCode === 'NOT_CONNECTED') {
        return {
          ok: false,
          errorCode: res.errorCode,
          summary: res.error || 'Reconnect Google to allow saving files.',
          fixButton: { label: 'Reconnect Google to allow saving files', url: '/drive' },
        };
      }
      if (res.errorCode === 'DUPLICATE_FILE') {
        return {
          ok: true,
          summary: res.error!,
          pendingConfirmation: {
            actionType: 'drive_upload_duplicate',
            payload: { ...args, fileName: res.name, folder: res.folderName },
            previewText: `⚠️ ${res.error}`,
            buttons: [
              [{ label: 'Keep both', callbackData: 'confirm' }, { label: 'Cancel', callbackData: 'cancel' }],
            ],
          },
        };
      }
      if (res.errorCode === 'FOLDER_CREATE_CONFIRM') {
        return {
          ok: true,
          summary: res.error!,
          pendingConfirmation: {
            actionType: 'drive_create_folder_and_upload',
            payload: { ...args, folder: res.folderName, allowCreateFolder: true },
            previewText: `📁 ${res.error}`,
            buttons: [
              [{ label: `Create "${res.folderName}" & Save`, callbackData: 'confirm' }, { label: 'Cancel', callbackData: 'cancel' }],
            ],
          },
        };
      }
      return { ok: false, summary: res.error || 'Drive upload failed.' };
    }

    return {
      ok: true,
      summary: `✅ Saved *${res.name}* to Google Drive folder *${res.folderName}* (${Math.round((res.sizeBytes || 0) / 1024)} KB).\n${res.webViewLink}`,
      buttons: res.webViewLink ? [[{ label: 'Open in Drive', url: res.webViewLink }]] : undefined,
      data: res,
    };
  },
};
