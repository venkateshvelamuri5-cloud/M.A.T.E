import { supabase } from '../../../src/supabase-client';
import { requestIngestion } from '../../../src/services/documents/client';
import { ALLOWED_UPLOADS, fileExtension, storageLimitMb } from './modules';
import { OfficerFile } from './officer';

// Upload, download and delete for an officer's own workspace documents.

export const UPLOAD_ACCEPT = ALLOWED_UPLOADS.join(',');

export function usedMb(files: OfficerFile[]) {
  return files.reduce((acc, f) => acc + Number(f.file_size_mb || 0), 0);
}

/** Checks type and space, uploads, records the file and starts processing. Throws with a readable message. */
export async function uploadOfficerFile(file: File, userId: string, plan: string, files: OfficerFile[]): Promise<OfficerFile> {
  const ext = fileExtension(file.name);
  if (!ALLOWED_UPLOADS.includes(ext)) {
    throw new Error(`${file.name}: only PDF, Word, text, Markdown, RTF, Excel and CSV files can be added.`);
  }
  const sizeMb = parseFloat((file.size / (1024 * 1024)).toFixed(2));
  const limit = storageLimitMb(plan);
  if (usedMb(files) + sizeMb > limit) {
    throw new Error(`${file.name} (${sizeMb} MB) doesn't fit in your ${limit} MB of space. Delete something first${plan === 'premium' ? '' : ', or upgrade for 5 GB'}.`);
  }
  const storagePath = `${userId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage.from('user-spaces').upload(storagePath, file);
  if (upErr) throw new Error(`${file.name}: ${upErr.message}`);
  const { data, error } = await supabase.from('user_files')
    .insert({ user_id: userId, name: file.name, storage_path: storagePath, file_type: ext.slice(1), file_size_mb: sizeMb })
    .select().single();
  if (error) throw new Error(`${file.name}: ${error.message}`);
  requestIngestion(data.id);
  return { ...(data as OfficerFile), ingest_status: data.ingest_status || 'queued' };
}

export async function downloadOfficerFile(file: OfficerFile) {
  const { data, error } = await supabase.storage.from('user-spaces').download(file.storage_path);
  if (error || !data) throw new Error(error?.message || 'The file could not be downloaded.');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function deleteOfficerFile(file: OfficerFile) {
  const { error: storageErr } = await supabase.storage.from('user-spaces').remove([file.storage_path]);
  if (storageErr) console.warn('Storage delete warning:', storageErr.message);
  const { error } = await supabase.from('user_files').delete().eq('id', file.id);
  if (error) throw error;
}
