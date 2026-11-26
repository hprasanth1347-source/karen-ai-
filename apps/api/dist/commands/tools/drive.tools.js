import { z } from 'zod';
import { getGoogleAccessToken } from '../../routes/googleDrive.js';
import { downloadTelegramFileSafe, uploadFileToDrive } from '../../services/driveUpload.service.js';
export const driveListTool = {
    name: 'drive_list',
    category: 'drive',
    description: 'List or search live files in Google Drive.',
    requiresConfirmation: false,
    inputSchema: z.object({ query: z.string().optional() }),
    jsonSchema: { type: 'object', properties: { query: { type: 'string' } } },
    async execute(args, ctx) {
        const token = await getGoogleAccessToken(ctx.userId);
        if (!token) {
            return {
                ok: false,
                summary: 'Google Drive is not connected yet.',
                fixButton: { label: 'Connect Google Drive', url: '/drive' },
            };
        }
        const qStr = args.query?.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'") || '';
        const params = new URLSearchParams({
            q: qStr ? `trashed = false and name contains '${qStr}'` : 'trashed = false',
            pageSize: '10',
            orderBy: 'modifiedTime desc',
            fields: 'files(id,name,mimeType,size,webViewLink)',
        });
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok)
            return { ok: false, summary: `Drive error (${res.status}).` };
        const json = (await res.json());
        const files = json.files || [];
        if (!files.length)
            return { ok: true, summary: 'No matching Google Drive files found.' };
        return {
            ok: true,
            summary: `📁 *Google Drive Files (${files.length}):*\n${files
                .map((f, i) => `${i + 1}. *${f.name}*${f.webViewLink ? ` — ${f.webViewLink}` : ''}`)
                .join('\n')}`,
        };
    },
};
export const driveUploadTool = {
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
        let buffer;
        if (fileRef.dataBase64) {
            buffer = Buffer.from(fileRef.dataBase64, 'base64');
        }
        else if (fileRef.source === 'telegram' && fileRef.fileId) {
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
                    summary: res.error,
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
                    summary: res.error,
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
