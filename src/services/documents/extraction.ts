import pdfParse from 'pdf-parse';

/**
 * Extracts text per page from an uploaded file. PDFs keep their page boundaries so chunks can
 * cite page numbers and image-only pages can be sent to OCR; other formats return one page.
 */
export interface ExtractedDocument {
  pages: string[];
  /** 0-based indexes of PDF pages that have (almost) no extractable text, e.g. scanned pages. */
  imagePageIndexes: number[];
}

const MIN_TEXT_CHARS_PER_PAGE = 30;

export function fileExtensionOf(file: { name: string; file_type?: string | null }): string {
  let ext = (file.file_type || '').toLowerCase();
  if ((!ext || ext === 'knowledge_base' || ext === 'letterhead') && file.name.includes('.')) {
    ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
  }
  return ext;
}

async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let lastY: number | undefined;
      let text = '';
      for (const item of textContent.items) {
        text += lastY === item.transform[5] || lastY === undefined ? item.str : `\n${item.str}`;
        lastY = item.transform[5];
      }
      const index = typeof pageData.pageNumber === 'number' ? pageData.pageNumber - 1 : pages.length;
      pages[index] = text;
      return text;
    },
  });
  return Array.from(pages, p => p || '');
}

export async function extractDocument(buffer: Buffer, ext: string): Promise<ExtractedDocument> {
  if (ext === 'pdf') {
    const pages = await extractPdfPages(buffer);
    const imagePageIndexes = pages
      .map((p, i) => (p.replace(/\s+/g, '').length < MIN_TEXT_CHARS_PER_PAGE ? i : -1))
      .filter(i => i >= 0);
    return { pages, imagePageIndexes };
  }
  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { pages: [result.value || ''], imagePageIndexes: [] };
  }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    // One "page" per sheet so a sheet's name stays with its rows.
    const pages = workbook.SheetNames.map((sheetName: string) =>
      `# Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`
    );
    return { pages, imagePageIndexes: [] };
  }
  // txt, md, rtf and anything else readable as text
  return { pages: [buffer.toString('utf8')], imagePageIndexes: [] };
}
