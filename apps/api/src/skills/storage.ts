import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import type { GeneratedSkillFile } from './types.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

export async function storeGeneratedSkillFile(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  userId?: string;
  skillName: string;
}): Promise<GeneratedSkillFile> {
  if (input.buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(`Generated file exceeds 25MB limit (${input.buffer.byteLength} bytes)`);
  }

  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const bucket = config.SKILLS_STORAGE_BUCKET || 'karen-skill-outputs';
  const storagePath = `${input.userId || 'owner'}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
  const supabase = supabaseAdmin;

  if (supabase) {
    try {
      await supabase.storage
        .createBucket(bucket, { public: false, fileSizeLimit: MAX_FILE_BYTES })
        .catch(() => {});

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, input.buffer, {
          contentType: input.mimeType,
          upsert: false,
        });

      if (!uploadErr) {
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 3600);

        // Record for 7-day auto-purge
        await supabase
          .from('skill_runs')
          .insert({
            skill_name: input.skillName,
            status: 'ok',
            output_files: [{ name: safeName, path: storagePath, bucket }],
            user_id: input.userId || null,
          })
          .then(() => {}, () => {});

        if (signed?.signedUrl) {
          return {
            name: safeName,
            mimeType: input.mimeType,
            url: signed.signedUrl,
            sizeBytes: input.buffer.byteLength,
            storagePath,
          };
        }
      } else {
        logger.warn('Supabase storage upload failed for generated file', { uploadErr });
      }
    } catch (err) {
      logger.warn('Storage upload error for generated file', { err });
    }
  }

  // Fallback data URL when Supabase Storage is unavailable (e.g. unit tests / local dev without bucket)
  const base64 = input.buffer.toString('base64');
  return {
    name: safeName,
    mimeType: input.mimeType,
    url: `data:${input.mimeType};base64,${base64}`,
    sizeBytes: input.buffer.byteLength,
  };
}

export async function purgeOldGeneratedSkillFiles(): Promise<number> {
  const supabase = supabaseAdmin;
  if (!supabase) return 0;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const bucket = config.SKILLS_STORAGE_BUCKET || 'karen-skill-outputs';

  try {
    const { data: oldRuns } = await supabase
      .from('skill_runs')
      .select('id, output_files')
      .lt('created_at', cutoff)
      .limit(100);

    if (!oldRuns || oldRuns.length === 0) return 0;

    const paths: string[] = [];
    for (const row of oldRuns) {
      const files = Array.isArray(row.output_files) ? row.output_files : [];
      for (const f of files as Array<{ path?: string }>) {
        if (f?.path) paths.push(f.path);
      }
    }
    if (paths.length > 0) {
      await supabase.storage.from(bucket).remove(paths).catch(() => {});
    }
    const ids = (oldRuns as Array<{ id: string }>).map((r) => r.id);
    await supabase.from('skill_runs').delete().in('id', ids);
    return oldRuns.length;
  } catch {
    return 0;
  }
}
