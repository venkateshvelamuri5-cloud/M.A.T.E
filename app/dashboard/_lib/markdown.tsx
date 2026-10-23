'use client';
import React from 'react';

// A small Markdown reader for agent answers: headings, lists, tables, quotes, rules, bold, italics and code.
// It builds React elements (no raw HTML), and the same blocks feed the Word export.

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'rule' };

const isRule = (l: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const listMatch = (l: string) => l.match(/^\s*(?:([-*+•])|(\d+)[.)])\s+(.*)$/);

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const h = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, text: h[2] }); i++; continue; }
    if (isRule(line)) { blocks.push({ type: 'rule' }); i++; continue; }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }
    const lm = listMatch(line);
    if (lm) {
      const ordered = !!lm[2];
      const items: string[] = [];
      while (i < lines.length) {
        const m = listMatch(lines[i]);
        if (m && !!m[2] === ordered) { items.push(m[3]); i++; continue; }
        // A wrapped line continues the previous item.
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !listMatch(lines[i]) && !/^\s*#{1,6}\s/.test(lines[i]) && !isRule(lines[i]) && !/^\s*>/.test(lines[i]) && !lines[i].trim().startsWith('```') &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      body.push(lines[i++]);
    }
    blocks.push({ type: 'paragraph', text: body.join('\n') });
  }
  return blocks;
}

export interface Span { text: string; bold?: boolean; italic?: boolean; code?: boolean }

/** Splits a line into bold / italic / code runs. */
export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  const re = /(\*\*|__)(.+?)\1|`([^`]+)`|(\*|_)([^*_\s][^*_]*?)\4/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) spans.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) spans.push({ text: m[3], code: true });
    else spans.push({ text: m[5], italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => {
        const parts = s.text.split('\n');
        const content = parts.map((p, j) => <React.Fragment key={j}>{j > 0 && <br />}{p}</React.Fragment>);
        if (s.code) return <code key={i} className="px-1 py-0.5 rounded bg-muted font-mono text-[0.9em]">{content}</code>;
        if (s.bold) return <strong key={i} className="font-semibold">{content}</strong>;
        if (s.italic) return <em key={i}>{content}</em>;
        return <React.Fragment key={i}>{content}</React.Fragment>;
      })}
    </>
  );
}

const HEADING_CLASS = ['', 'text-xl font-bold mt-6', 'text-lg font-bold mt-6', 'text-base font-bold mt-5', 'text-sm font-bold mt-4', 'text-sm font-semibold mt-4', 'text-sm font-semibold mt-4'];

/** Headings in an answer, for a contents list. Ids match the ones Markdown gives with the same prefix. */
export function headingsOf(text: string, idPrefix: string) {
  return parseMarkdown(text)
    .map((b, i) => b.type === 'heading' && b.level <= 3 ? { id: `${idPrefix}-${i}`, text: b.text.replace(/[*_`]/g, ''), level: b.level } : null)
    .filter(Boolean) as { id: string; text: string; level: number }[];
}

export function Markdown({ text, idPrefix }: { text: string; idPrefix?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="text-sm leading-relaxed text-foreground space-y-3 break-words [&>*:first-child]:mt-0">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const Tag = `h${Math.min(b.level + 1, 6)}` as keyof JSX.IntrinsicElements;
            return <Tag key={i} id={idPrefix ? `${idPrefix}-${i}` : undefined} className={`${HEADING_CLASS[b.level]} font-display text-foreground scroll-mt-24`}><Inline text={b.text} /></Tag>;
          }
          case 'paragraph': return <p key={i}><Inline text={b.text} /></p>;
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} className={`${b.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 marker:text-muted-foreground`}>
                {b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}
              </Tag>
            );
          }
          case 'table': return (
            <div key={i} className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[13px] border-collapse">
                <thead className="bg-muted/70">
                  <tr>{b.header.map((c, j) => <th key={j} className="text-left font-semibold px-3 py-2 border-b border-border align-bottom"><Inline text={c} /></th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j} className="border-b border-border last:border-b-0 align-top">
                      {b.header.map((_, k) => <td key={k} className="px-3 py-2"><Inline text={r[k] || ''} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          case 'quote': return <blockquote key={i} className="border-l-2 border-[#575ECF]/50 pl-3 text-muted-foreground"><Inline text={b.text} /></blockquote>;
          case 'code': return <pre key={i} className="bg-muted rounded-lg p-3 overflow-x-auto font-mono text-xs whitespace-pre">{b.text}</pre>;
          case 'rule': return <hr key={i} className="border-border my-4" />;
        }
      })}
    </div>
  );
}

/** Builds a Word document from an answer. docx is loaded only when someone downloads. */
export async function markdownToDocx(title: string, text: string, meta: string[] = []): Promise<Blob> {
  const d = await import('docx');
  const runs = (t: string, extra: { bold?: boolean } = {}) =>
    parseInline(t).flatMap(s => s.text.split('\n').map((p, j) => new d.TextRun({
      text: p, bold: s.bold || extra.bold, italics: s.italic, font: s.code ? 'Consolas' : undefined, break: j > 0 ? 1 : undefined
    })));
  const headingLevels = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3, d.HeadingLevel.HEADING_4, d.HeadingLevel.HEADING_5, d.HeadingLevel.HEADING_6];

  const children: any[] = [new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun(title)] })];
  meta.forEach((line, i) => children.push(new d.Paragraph({
    children: [new d.TextRun({ text: line, color: '666666', size: 18 })],
    spacing: { after: i === meta.length - 1 ? 240 : 0 },
    border: i === meta.length - 1 ? { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 6 } } : undefined
  })));
  for (const b of parseMarkdown(text)) {
    if (b.type === 'heading') children.push(new d.Paragraph({ heading: headingLevels[b.level], children: runs(b.text) }));
    else if (b.type === 'paragraph') children.push(new d.Paragraph({ children: runs(b.text), spacing: { after: 120 } }));
    else if (b.type === 'quote') children.push(new d.Paragraph({ children: runs(b.text), indent: { left: 400 } }));
    else if (b.type === 'code') children.push(new d.Paragraph({ children: b.text.split('\n').map((p, j) => new d.TextRun({ text: p, font: 'Consolas', break: j > 0 ? 1 : undefined })) }));
    else if (b.type === 'rule') children.push(new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } }, children: [] }));
    else if (b.type === 'list') {
      b.items.forEach((it, j) => children.push(new d.Paragraph({
        children: [new d.TextRun(b.ordered ? `${j + 1}. ` : '• '), ...runs(it)],
        indent: { left: 400, hanging: 260 }
      })));
    } else if (b.type === 'table') {
      const cell = (t: string, header: boolean) => new d.TableCell({
        children: [new d.Paragraph({ children: runs(t, { bold: header }) })],
        shading: header ? { fill: 'EEEEF4', type: d.ShadingType.CLEAR, color: 'auto' } : undefined
      });
      children.push(new d.Table({
        width: { size: 100, type: d.WidthType.PERCENTAGE },
        rows: [
          new d.TableRow({ tableHeader: true, children: b.header.map(c => cell(c, true)) }),
          ...b.rows.map(r => new d.TableRow({ children: b.header.map((_, k) => cell(r[k] || '', false)) }))
        ]
      }));
      children.push(new d.Paragraph({ children: [] }));
    }
  }
  const doc = new d.Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }]
  });
  return d.Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
