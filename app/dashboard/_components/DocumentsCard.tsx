'use client';
import React, { useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { useOfficer } from '../_lib/officer';
import { deleteOfficerFile, downloadOfficerFile, uploadOfficerFile, UPLOAD_ACCEPT, usedMb } from '../_lib/files';
import { storageLimitMb } from '../_lib/modules';
import { Card, Meter, fileStatusChip, formatMb } from '../_lib/ui';

/** The officer's own documents: space used, drop-to-upload, processing status, download and delete. */
export default function DocumentsCard() {
  const { files, setFiles, userId, plan, toast, confirm, startUpgrade } = useOfficer();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const limit = storageLimitMb(plan);
  const used = usedMb(files);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    let current = files;
    for (const file of Array.from(list)) {
      setUploading(n => n + 1);
      try {
        const row = await uploadOfficerFile(file, userId, plan, current);
        current = [row, ...current];
        setFiles(current);
        toast(`Added ${file.name}. It'll be ready to use in a moment.`);
      } catch (err) {
        toast((err as Error).message, 'error');
      } finally {
        setUploading(n => n - 1);
      }
    }
  };

  const remove = async (f: typeof files[number]) => {
    const ok = await confirm({ title: `Delete ${f.name}?`, body: 'It is removed from your workspace and can\'t be used in answers any more.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await deleteOfficerFile(f);
      setFiles(fs => fs.filter(x => x.id !== f.id));
      toast(`Deleted ${f.name}.`);
    } catch (err) {
      toast(`Couldn't delete ${f.name}: ${(err as Error).message}`, 'error');
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">My documents</h2>
          <p className="text-xs text-muted-foreground">Manuals, office emails or checklists you want answers to use.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Meter used={used} max={limit} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{formatMb(used)} of {limit >= 1000 ? `${limit / 1000} GB` : `${limit} MB`} used</span>
          {plan !== 'premium' && <button type="button" onClick={startUpgrade} className="font-semibold text-[#575ECF] hover:underline">Get 5 GB</button>}
        </div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        role="button"
        tabIndex={0}
        className={`rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition ${dragging ? 'border-[#575ECF] bg-indigo-50/60' : 'border-border hover:border-[#575ECF]/60 hover:bg-muted/40'}`}
      >
        <Upload className="w-5 h-5 mx-auto text-muted-foreground" />
        <div className="text-sm font-medium mt-1.5">{uploading > 0 ? `Uploading ${uploading} file${uploading > 1 ? 's' : ''}…` : 'Drop files or click to add'}</div>
        <div className="text-xs text-muted-foreground">PDF, Word, Excel, CSV, text</div>
        <input ref={input} type="file" multiple accept={UPLOAD_ACCEPT} className="hidden" onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      </div>

      {files.length > 0 ? (
        <ul className="divide-y divide-border -mx-1 max-h-80 overflow-y-auto">
          {files.map(f => (
            <li key={f.id} className="flex items-center gap-2 px-1 py-2.5">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate" title={f.name}>{f.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">{formatMb(Number(f.file_size_mb || 0))} {fileStatusChip(f)}</div>
              </div>
              <button type="button" onClick={() => downloadOfficerFile(f).catch(err => toast(`Couldn't download: ${err.message}`, 'error'))}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label={`Download ${f.name}`}><Download className="w-4 h-4" /></button>
              <button type="button" onClick={() => remove(f)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${f.name}`}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No documents yet. Company documents from the M.A.T.E team are always included in answers.</p>
      )}
    </Card>
  );
}
