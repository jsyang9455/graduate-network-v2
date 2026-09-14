'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_DIR = path.join(__dirname, 'fonts');
const FONT_REG = path.join(FONT_DIR, 'NotoSansKR-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'NotoSansKR-Bold.ttf');

function fontPaths() {
  const regular = fs.existsSync(FONT_REG) ? FONT_REG : null;
  const bold = fs.existsSync(FONT_BOLD) ? FONT_BOLD : regular;
  return { regular, bold };
}

function registerKoreanFonts(doc) {
  const { regular, bold } = fontPaths();
  if (regular) {
    doc.registerFont('KR', regular);
    doc.registerFont('KR-Bold', bold || regular);
    return { regular: 'KR', bold: 'KR-Bold', embedded: true };
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', embedded: false };
}

function createPdfBuffer(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Producer: 'jjobb_v2' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const fonts = registerKoreanFonts(doc);
      const result = draw(doc, fonts);
      if (result && typeof result.then === 'function') {
        result.then(() => doc.end()).catch(reject);
      } else {
        doc.end();
      }
    } catch (err) {
      reject(err);
    }
  });
}

function ensurePageSpace(doc, needed = 60) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function heading(doc, fonts, text) {
  ensurePageSpace(doc, 36);
  doc.font(fonts.bold).fontSize(14).fillColor('#1e3a8a').text(text);
  doc.moveDown(0.3);
  doc.strokeColor('#c7d2fe').lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor('#111827');
}

function body(doc, fonts, text, opts = {}) {
  if (!text) return;
  ensurePageSpace(doc, 24);
  doc.font(fonts.regular).fontSize(opts.size || 10).fillColor(opts.color || '#111827')
    .text(String(text), { align: opts.align || 'left' });
}

module.exports = {
  fontPaths,
  registerKoreanFonts,
  createPdfBuffer,
  ensurePageSpace,
  heading,
  body,
};
