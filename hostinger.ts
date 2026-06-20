"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneratorService = void 0;
const pdf_lib_1 = require("pdf-lib");
const docx_1 = require("docx");
/**
 * Generator Service Class
 * Handles creation of PDF documents using 'pdf-lib' and Word documents using 'docx'.
 */
class GeneratorService {
    /**
     * Generates a PDF. If a letterhead buffer is provided, it draws the response text directly on it.
     * Otherwise, it creates a new PDF from scratch.
     */
    async generatePDF(text, letterheadBuffer) {
        let pdfDoc;
        if (letterheadBuffer) {
            // Load the existing letterhead template
            pdfDoc = await pdf_lib_1.PDFDocument.load(letterheadBuffer);
        }
        else {
            // Create a fresh new document
            pdfDoc = await pdf_lib_1.PDFDocument.create();
        }
        // Get or create page
        let page = pdfDoc.getPages()[0];
        if (!page) {
            page = pdfDoc.addPage([595.276, 841.89]); // A4 Size standard
        }
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
        const fontSize = 11;
        const margin = 50;
        // Draw text with wrapping
        const words = text.split(/\s+/);
        let currentLine = '';
        let currentY = height - margin - 100; // Leave space for letterhead graphics
        page.drawText('GENERATED DOCUMENT RESPONSE', {
            x: margin,
            y: height - margin - 40,
            size: 16,
            font,
            color: (0, pdf_lib_1.rgb)(0.1, 0.2, 0.5)
        });
        for (let i = 0; i < words.length; i++) {
            const testLine = currentLine + words[i] + ' ';
            const testLineWidth = font.widthOfTextAtSize(testLine, fontSize);
            if (testLineWidth > width - 2 * margin) {
                page.drawText(currentLine, {
                    x: margin,
                    y: currentY,
                    size: fontSize,
                    font,
                    color: (0, pdf_lib_1.rgb)(0.1, 0.1, 0.1)
                });
                currentLine = words[i] + ' ';
                currentY -= fontSize + 6;
                // If page fills up, create a new page
                if (currentY < margin) {
                    page = pdfDoc.addPage([595.276, 841.89]);
                    currentY = height - margin;
                }
            }
            else {
                currentLine = testLine;
            }
        }
        // Draw remaining text
        if (currentLine.trim()) {
            page.drawText(currentLine, {
                x: margin,
                y: currentY,
                size: fontSize,
                font,
                color: (0, pdf_lib_1.rgb)(0.1, 0.1, 0.1)
            });
        }
        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);
    }
    /**
     * Generates a Word document (.docx) containing the clean structured output text.
     */
    async generateDOCX(text, title = 'Response Document') {
        const doc = new docx_1.Document({
            sections: [
                {
                    properties: {},
                    children: [
                        new docx_1.Paragraph({
                            alignment: docx_1.AlignmentType.CENTER,
                            children: [
                                new docx_1.TextRun({
                                    text: title,
                                    bold: true,
                                    size: 32, // 16 pt
                                    color: '1A365D', // Dark Blue
                                }),
                            ],
                        }),
                        new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: '',
                                }),
                            ],
                        }),
                        ...text.split('\n').map(line => {
                            return new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: line,
                                        size: 22, // 11 pt
                                    }),
                                ],
                            });
                        })
                    ],
                },
            ],
        });
        const buffer = await docx_1.Packer.toBuffer(doc);
        return buffer;
    }
}
exports.GeneratorService = GeneratorService;
