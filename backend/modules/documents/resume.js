'use strict';

const { createPdfBuffer, heading, body, ensurePageSpace } = require('./pdf');
const { packDocx, p, h1, h2 } = require('./docx');
const { escapeHtml } = require('../../lib/escapeHtml');

const SECTION_LABELS = {
  education: '학력',
  experience: '경력',
  certificate: '자격증',
  award: '수상',
  language: '어학',
  skill: '스킬',
  portfolio: '포트폴리오',
  intro: '자기소개서',
};

function itemsBySection(items) {
  const map = {};
  for (const item of items || []) {
    if (!map[item.section]) map[item.section] = [];
    map[item.section].push(item);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  return map;
}

function formatItemLine(section, payload) {
  const d = payload || {};
  switch (section) {
    case 'experience':
      return `${d.company || ''} / ${d.position || ''} (${d.startDate || ''} ~ ${d.current ? '현재' : (d.endDate || '')})\n${d.description || ''}`.trim();
    case 'education':
      return `${d.institution || d.school || ''} ${d.name || d.major || ''} (${d.startDate || ''} ~ ${d.endDate || ''})\n${d.description || ''}`.trim();
    case 'certificate':
      return `${d.name || ''} — ${d.issuer || ''} (${d.date || ''})`.trim();
    case 'award':
      return `${d.name || ''} — ${d.issuer || ''} (${d.date || ''})\n${d.description || ''}`.trim();
    case 'language':
      return `${d.name || ''} (${d.level || ''})`.trim();
    case 'skill':
      return d.name || '';
    case 'portfolio':
      return `${d.title || ''}\n${d.description || ''}${d.tech ? `\n기술: ${d.tech}` : ''}${d.link ? `\n${d.link}` : ''}`.trim();
    case 'intro':
      return d.text || '';
    default:
      return JSON.stringify(d);
  }
}

async function renderResumePdf(resume, items) {
  const info = resume.basic_info || {};
  const grouped = itemsBySection(items);
  const compact = resume.template_code === 'compact';

  return createPdfBuffer((doc, fonts) => {
    doc.font(fonts.bold).fontSize(compact ? 16 : 20).fillColor('#1e3a8a')
      .text(resume.title || '이력서', { align: 'center' });
    doc.moveDown(0.4);
    doc.font(fonts.regular).fontSize(11).fillColor('#111827')
      .text(info.name || '', { align: 'center' });
    const contact = [info.email, info.phone, info.school_name, info.major].filter(Boolean).join(' · ');
    if (contact) {
      doc.fontSize(9).fillColor('#4b5563').text(contact, { align: 'center' });
    }
    doc.moveDown(1);

    const order = ['intro', 'education', 'experience', 'certificate', 'award', 'language', 'skill', 'portfolio'];
    if (resume.summary) {
      heading(doc, fonts, '자기소개서');
      body(doc, fonts, resume.summary);
      doc.moveDown(0.4);
    }
    for (const section of order) {
      if (section === 'intro' && resume.summary) continue;
      const list = grouped[section] || [];
      if (!list.length) continue;
      heading(doc, fonts, SECTION_LABELS[section] || section);
      if (section === 'skill') {
        body(doc, fonts, list.map((i) => (i.payload || {}).name).filter(Boolean).join(', '));
        doc.moveDown(0.3);
        continue;
      }
      for (const item of list) {
        ensurePageSpace(doc, 40);
        body(doc, fonts, formatItemLine(section, item.payload));
        doc.moveDown(0.25);
      }
    }
    doc.moveDown(1);
    doc.font(fonts.regular).fontSize(8).fillColor('#9ca3af')
      .text(`jjobb v2 · ${resume.template_code || 'basic'} · v${resume.version || 1}`, { align: 'right' });
  });
}

function previewHtml(resume, items) {
  const info = resume.basic_info || {};
  const grouped = itemsBySection(items);
  const order = ['intro', 'education', 'experience', 'certificate', 'award', 'language', 'skill', 'portfolio'];
  let html = `<article class="resume-preview">
    <h1>${escapeHtml(resume.title || '이력서')}</h1>
    <p class="resume-name">${escapeHtml(info.name || '')}</p>
    <p class="resume-meta">${escapeHtml([info.email, info.phone, info.school_name, info.major].filter(Boolean).join(' · '))}</p>`;
  if (resume.summary) {
    html += `<h2>자기소개서</h2><p>${escapeHtml(resume.summary).replace(/\n/g, '<br>')}</p>`;
  }
  for (const section of order) {
    if (section === 'intro' && resume.summary) continue;
    const list = grouped[section] || [];
    if (!list.length) continue;
    html += `<h2>${escapeHtml(SECTION_LABELS[section])}</h2>`;
    html += '<ul>';
    for (const item of list) {
      html += `<li>${escapeHtml(formatItemLine(section, item.payload)).replace(/\n/g, '<br>')}</li>`;
    }
    html += '</ul>';
  }
  html += '</article>';
  return html;
}

async function renderResumeDocx(resume, items) {
  const info = resume.basic_info || {};
  const grouped = itemsBySection(items);
  const children = [
    h1(resume.title || '이력서'),
    p(info.name || '', { bold: true, size: 26 }),
    p([info.email, info.phone, info.school_name, info.major].filter(Boolean).join(' · ')),
  ];
  if (resume.summary) {
    children.push(h2('자기소개서'), p(resume.summary));
  }
  const order = ['intro', 'education', 'experience', 'certificate', 'award', 'language', 'skill', 'portfolio'];
  for (const section of order) {
    if (section === 'intro' && resume.summary) continue;
    const list = grouped[section] || [];
    if (!list.length) continue;
    children.push(h2(SECTION_LABELS[section]));
    for (const item of list) children.push(p(formatItemLine(section, item.payload)));
  }
  return packDocx(children);
}

module.exports = {
  SECTION_LABELS,
  itemsBySection,
  formatItemLine,
  renderResumePdf,
  renderResumeDocx,
  previewHtml,
};
