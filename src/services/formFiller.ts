import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { supabase } from '../supabase-client';
import { GeminiService } from './gemini';

type Attachment = { filename: string; content: Buffer; contentType: string };
type Delimiters = { start: string; end: string };

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
// Names that suggest a blank form rather than a manual or a past record.
const FORM_NAME = /(form|template|blank|drill|log|record)/i;

interface FileRow {
  id: string;
  user_id: string;
  name: string;
  storage_path: string;
  file_type: string | null;
  agent_id: string | null;
  created_at: string;
}

function isDocx(f: FileRow) {
  return (f.file_type || '').toLowerCase() === 'docx' || f.name.toLowerCase().endsWith('.docx');
}

function bucketFor(f: FileRow) {
  return f.agent_id || f.user_id === SYSTEM_USER || f.file_type === 'knowledge_base' ? 'knowledge-base' : 'user-spaces';
}

/** Placeholders in a Word file, in either {{double}} or {single} braces. Null when it has none. */
function readPlaceholders(buffer: Buffer): { delimiters: Delimiters; tags: string[] } | null {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    return null;
  }
  // Word splits text into runs, so strip the XML before looking for braces.
  const text = Object.keys(zip.files)
    .filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name))
    .map(name => zip.file(name)!.asText().replace(/<[^>]+>/g, ''))
    .join('\n');

  const collect = (re: RegExp) => {
    const tags: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) if (!tags.includes(m[1])) tags.push(m[1]);
    return tags;
  };
  const double = collect(/\{\{\s*([A-Za-z0-9_.\- ]+?)\s*\}\}/g);
  if (double.length) return { delimiters: { start: '{{', end: '}}' }, tags: double };
  const single = collect(/\{\s*([A-Za-z0-9_.\- ]+?)\s*\}/g);
  if (single.length) return { delimiters: { start: '{', end: '}' }, tags: single };
  return null;
}

export class FormFillerService {
  /**
   * Fills the officer's own blank Word form for this module (e.g. A3 Drill Notes) from their email text.
   * The form is any .docx with {{placeholders}} that the officer added to their documents, attached to
   * this email, or that an analyst linked to the module. Returns null when there is no such form, so the
   * caller answers the request normally instead of stopping.
   */
  async processAutocomplete(
    userId: string,
    agentId: string,
    pastedText: string,
    gemini: GeminiService,
    agentPrompt?: string
  ): Promise<{ text: string; attachment?: Attachment } | null> {
    const form = await this.findForm(userId, agentId);
    if (!form) return null;

    try {
      const keys = form.tags.map(t => `"${t}"`).join(', ');
      const prompt = `Extract the details for each placeholder in the officer's company form from the text below.

Placeholders to fill: ${keys}

Return ONLY a JSON object whose keys are exactly these placeholder names and whose values are strings. Use "" for any detail the text does not give. Do not include markdown or any other text.

Officer's text:
"""
${pastedText}
"""`;

      const directive = `${agentPrompt ? agentPrompt + '\n\n' : ''}Return pure JSON only.`;
      let jsonStr = await gemini.runGroundedQuery(prompt, '', [], directive, 'groq', agentId);
      jsonStr = jsonStr.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim();
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      let extracted: Record<string, unknown> = {};
      try {
        extracted = JSON.parse(start >= 0 && end > start ? jsonStr.slice(start, end + 1) : jsonStr);
      } catch {
        console.warn('Form filler: could not parse JSON from the model. Raw output:', jsonStr);
      }

      const values: Record<string, string> = {};
      for (const tag of form.tags) {
        const v = extracted[tag];
        values[tag] = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      }

      const doc = new Docxtemplater(new PizZip(form.buffer), {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: form.delimiters,
        // Match "{{ Name }}" to the "Name" key the model was given.
        parser: (tag: string) => ({ get: (scope: Record<string, string>) => scope[tag.trim()] }),
        nullGetter: () => ''
      });
      doc.render(values);
      const content = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;

      const filled = form.tags.filter(t => values[t]).length;
      return {
        text: `I filled in your form "${form.name}" from your notes (${filled} of ${form.tags.length} fields had details). The completed form is attached. Please check it before it goes in the official log.`,
        attachment: { filename: `Filled_${form.name}`, content, contentType: DOCX_MIME }
      };
    } catch (err) {
      console.error('FormFillerService Error:', err);
      return null;
    }
  }

  /** Newest suitable form: module-linked files first, then the officer's own Word files. */
  private async findForm(userId: string, agentId: string) {
    const [{ data: own }, { data: linked }] = await Promise.all([
      supabase.from('user_files').select('id, user_id, name, storage_path, file_type, agent_id, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('user_files').select('id, user_id, name, storage_path, file_type, agent_id, created_at')
        .eq('agent_id', agentId).order('created_at', { ascending: false }).limit(20)
    ]);

    const ownDocx = ((own || []) as FileRow[]).filter(isDocx);
    const candidates = [
      ...((linked || []) as FileRow[]).filter(isDocx),
      ...ownDocx.filter(f => FORM_NAME.test(f.name)),
      ...ownDocx.filter(f => !FORM_NAME.test(f.name))
    ];

    const seen = new Set<string>();
    for (const f of candidates) {
      if (seen.has(f.storage_path)) continue;
      seen.add(f.storage_path);
      const { data, error } = await supabase.storage.from(bucketFor(f)).download(f.storage_path);
      if (error || !data) {
        console.warn(`Form filler: could not download ${f.name}:`, error?.message);
        continue;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      const found = readPlaceholders(buffer);
      if (found) return { name: f.name, buffer, ...found };
    }
    return null;
  }
}
