'use strict';

const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: String(text ?? ''),
        bold: !!opts.bold,
        size: opts.size || 22,
        font: 'Malgun Gothic',
        color: opts.color || '111827',
      }),
    ],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
    children: [new TextRun({ text: String(text ?? ''), font: 'Malgun Gothic', bold: true, size: 32, color: '1e3a8a' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text: String(text ?? ''), font: 'Malgun Gothic', bold: true, size: 26, color: '1e3a8a' })],
  });
}

function kvTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 24, type: WidthType.PERCENTAGE },
          children: [p(k, { bold: true, size: 20 })],
        }),
        new TableCell({
          width: { size: 76, type: WidthType.PERCENTAGE },
          children: [p(v, { size: 20 })],
        }),
      ],
    })),
  });
}

async function packDocx(children) {
  const doc = new Document({
    creator: 'jjobb_v2',
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { p, h1, h2, kvTable, packDocx };
