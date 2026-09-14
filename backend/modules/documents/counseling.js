'use strict';

const { createPdfBuffer, heading, body } = require('./pdf');
const { packDocx, p, h1, h2, kvTable } = require('./docx');

function formatDate(value) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function journalKindTitle(kind) {
  return kind === 'confirm' ? '상담확인서' : '상담일지';
}

async function renderCounselingPdf(journal, { kind = 'journal' } = {}) {
  return createPdfBuffer((doc, fonts) => {
    doc.font(fonts.bold).fontSize(18).fillColor('#1e3a8a')
      .text(journalKindTitle(kind), { align: 'center' });
    doc.moveDown(1);
    heading(doc, fonts, '기본 정보');
    body(doc, fonts, `상담 일자: ${formatDate(journal.counseling_date)}`);
    body(doc, fonts, `유형: ${journal.type || '-'}`);
    body(doc, fonts, `학생: ${journal.student_name || '-'}`);
    body(doc, fonts, `담당 교사: ${journal.teacher_name || '-'}`);
    doc.moveDown(0.4);
    heading(doc, fonts, '제목');
    body(doc, fonts, journal.title || '');
    heading(doc, fonts, '상담 내용');
    body(doc, fonts, journal.content || '');
    if (journal.action_taken) {
      heading(doc, fonts, '조치');
      body(doc, fonts, journal.action_taken);
    }
    if (journal.follow_up || journal.follow_up_at) {
      heading(doc, fonts, '후속 일정');
      if (journal.follow_up_at) body(doc, fonts, `일자: ${formatDate(journal.follow_up_at)}`);
      if (journal.follow_up) body(doc, fonts, journal.follow_up);
    }
    doc.moveDown(1.5);
    body(doc, fonts, `작성일: ${formatDate(journal.created_at || new Date())}`);
    body(doc, fonts, '본 문서는 전북지역 졸업생 취업지원플랫폼에서 발급되었습니다.');
  });
}

async function renderCounselingDocx(journal, { kind = 'journal' } = {}) {
  const children = [
    h1(journalKindTitle(kind)),
    h2('기본 정보'),
    kvTable([
      ['상담 일자', formatDate(journal.counseling_date)],
      ['유형', journal.type || '-'],
      ['학생', journal.student_name || '-'],
      ['담당 교사', journal.teacher_name || '-'],
      ['제목', journal.title || '-'],
    ]),
    h2('상담 내용'),
    p(journal.content || ''),
  ];
  if (journal.action_taken) {
    children.push(h2('조치'), p(journal.action_taken));
  }
  if (journal.follow_up || journal.follow_up_at) {
    children.push(h2('후속 일정'));
    if (journal.follow_up_at) children.push(p(`일자: ${formatDate(journal.follow_up_at)}`));
    if (journal.follow_up) children.push(p(journal.follow_up));
  }
  children.push(p(`작성일: ${formatDate(journal.created_at || new Date())}`));
  children.push(p('본 문서는 전북지역 졸업생 취업지원플랫폼에서 발급되었습니다.'));
  return packDocx(children);
}

module.exports = { renderCounselingPdf, renderCounselingDocx, formatDate };
