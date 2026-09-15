// 상담일지 페이지 JavaScript — API 연동 버전

document.addEventListener('DOMContentLoaded', () => { initJournalPage(); });

function isStaffAdminUser(user) {
    return user && (user.user_type === 'admin' || user.user_type === 'school_admin'
        || user.role === 'system_admin' || user.role === 'school_admin');
}

function isTeacherOrAdminUser(user) {
    return user && (user.user_type === 'teacher' || isStaffAdminUser(user));
}

// ─── API 헬퍼 ─────────────────────────────────────────────────

function getApiBase() {
    return typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '/api';
}

async function apiCall(method, endpoint, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(getApiBase() + endpoint, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '요청 실패');
    return data;
}

async function fetchJournals() {
    const container = document.getElementById('journalList');
    if (container) container.innerHTML = '<div class="empty-state"><p>불러오는 중...</p></div>';
    try {
        const data = await apiCall('GET', '/counseling-journals');
        allJournals = data.journals || [];
    } catch (e) {
        console.warn('상담일지 API 실패:', e.message);
        allJournals = [];
    }
    renderJournals();
}

async function initJournalPage() {
    // 로그인 체크
    const userStr = localStorage.getItem('graduateNetwork_user');
    if (!userStr) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    currentUser = JSON.parse(userStr);

    // 교사 계정이지만 상담교사로 지정되지 않은 경우 차단
    if (currentUser.user_type === 'teacher' && !currentUser.is_counselor) {
        alert('상담교사로 지정된 교사만 상담일지를 이용할 수 있습니다.\n관리자에게 상담교사 권한을 요청하세요.');
        window.location.href = 'dashboard.html';
        return;
    }

    // 헤더 사용자 이름
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = currentUser.name || '';

    // 관리자 메뉴
    if (isStaffAdminUser(currentUser)) {
        const adminSection = document.getElementById('adminMenuSection');
        if (adminSection) adminSection.style.display = 'block';
    }

    // 교사/관리자만 작성 버튼 표시
    if (isTeacherOrAdminUser(currentUser)) {
        const addBtn = document.getElementById('addJournalBtn');
        if (addBtn) addBtn.style.display = '';
    }

    // 학생/졸업생 부제목
    if (currentUser.user_type === 'student' || currentUser.user_type === 'graduate') {
        const subtitle = document.getElementById('pageSubtitle');
        if (subtitle) subtitle.textContent = '나의 상담 내용을 확인합니다.';
    }

    await fetchJournals();
    await loadJournalStats();
    await setupStudentTimeline();
}

// ─── 목록 렌더링 ──────────────────────────────────────────────

function renderJournals() {
    const container = document.getElementById('journalList');
    if (!container) return;

    let list = [...allJournals];

    // 유형 필터
    const typeFilter = document.getElementById('filterType')?.value || '';
    if (typeFilter) list = list.filter(j => j.type === typeFilter);

    // 검색 필터
    const searchText = (document.getElementById('filterSearch')?.value || '').trim().toLowerCase();
    if (searchText) {
        list = list.filter(j =>
            (j.student_name || '').toLowerCase().includes(searchText) ||
            (j.title || '').toLowerCase().includes(searchText)
        );
    }

    // 최신순 정렬
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>📭 등록된 상담일지가 없습니다.</p></div>`;
        return;
    }

    const isTeacherOrAdmin = isTeacherOrAdminUser(currentUser);

    container.innerHTML = list.map(j => {
        const dateStr = j.counseling_date ? formatDate(j.counseling_date) : '-';
        const contentPreview = (j.content || '').length > 80
            ? j.content.substring(0, 80) + '...'
            : (j.content || '');

        const actionBtns = isTeacherOrAdmin && (
            isStaffAdminUser(currentUser) || String(j.teacher_id) === String(currentUser.id)
        ) ? `
            <div class="journal-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="openJournalModal('${j.id}')">수정</button>
                <button class="btn btn-secondary btn-sm" onclick="exportJournal('${j.id}','pdf')">PDF</button>
                <button class="btn btn-secondary btn-sm" onclick="exportJournal('${j.id}','docx')">DOCX</button>
                <button class="btn btn-danger btn-sm" onclick="deleteJournal('${j.id}')">삭제</button>
            </div>` : `
            <div class="journal-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="exportJournal('${j.id}','pdf')">PDF</button>
                <button class="btn btn-secondary btn-sm" onclick="exportJournal('${j.id}','docx')">DOCX</button>
            </div>`;

        const privateBadge = j.is_private ? `<span class="privacy-badge">🔒 비공개</span>` : '';

        return `
        <div class="journal-card">
            <div class="journal-card-header">
                <div>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <span class="journal-type-badge">${escHtml(j.type || '기타')}</span>
                        ${privateBadge}
                    </div>
                    <div class="journal-card-title" style="margin-top:0.5rem;">${escHtml(j.title || '')}</div>
                    <div class="journal-card-meta">
                        <span>📅 ${dateStr}</span>
                        <span>👤 학생: ${escHtml(j.student_name || '-')}</span>
                        <span>👩‍🏫 교사: ${escHtml(j.teacher_name || '-')}</span>
                    </div>
                </div>
                <button class="btn btn-outline btn-sm" onclick="openDetailModal('${j.id}')">상세보기</button>
            </div>
            <div class="journal-card-body">${escHtml(contentPreview)}</div>
            ${j.follow_up ? `<div class="journal-card-followup">📌 후속조치: ${escHtml(j.follow_up)}</div>` : ''}
            ${actionBtns}
        </div>`;
    }).join('');
}

// ─── 모달: 작성/수정 ──────────────────────────────────────────

function openJournalModal(id) {
    document.getElementById('journalForm').reset();
    document.getElementById('journalId').value = '';
    document.getElementById('journalModalTitle').textContent = '상담일지 작성';

    if (id) {
        const j = allJournals.find(x => String(x.id) === String(id));
        if (!j) return;

        document.getElementById('journalModalTitle').textContent = '상담일지 수정';
        document.getElementById('journalId').value = j.id;
        document.getElementById('journalDate').value = (j.counseling_date || '').substring(0, 10);
        document.getElementById('journalType').value = j.type || '';
        document.getElementById('journalStudentName').value = j.student_name || '';
        document.getElementById('journalStudentId').value = j.student_id || '';
        document.getElementById('journalTitle').value = j.title || '';
        document.getElementById('journalContent').value = j.content || '';
        document.getElementById('journalFollowUp').value = j.follow_up || '';
        document.getElementById('journalActionTaken').value = j.action_taken || '';
        document.getElementById('journalFollowUpAt').value = (j.follow_up_at || '').substring(0, 10);
        document.getElementById('journalPrivate').checked = !!j.is_private;
    } else {
        document.getElementById('journalDate').value = new Date().toISOString().slice(0, 10);
    }

    document.getElementById('journalModal').classList.add('open');
}

function closeJournalModal() {
    document.getElementById('journalModal').classList.remove('open');
}

async function saveJournal(event) {
    event.preventDefault();

    const id = document.getElementById('journalId').value;
    const payload = {
        student_id:      document.getElementById('journalStudentId').value || null,
        student_name:    document.getElementById('journalStudentName').value.trim(),
        counseling_date: document.getElementById('journalDate').value,
        type:            document.getElementById('journalType').value,
        title:           document.getElementById('journalTitle').value.trim(),
        content:         document.getElementById('journalContent').value.trim(),
        follow_up:       document.getElementById('journalFollowUp').value.trim() || null,
        action_taken:    (document.getElementById('journalActionTaken')?.value || '').trim() || null,
        follow_up_at:    document.getElementById('journalFollowUpAt')?.value || null,
        is_private:      document.getElementById('journalPrivate').checked,
    };

    try {
        if (id) await apiCall('PUT', '/counseling-journals/' + id, payload);
        else    await apiCall('POST', '/counseling-journals', payload);
        closeJournalModal();
        await fetchJournals();
        showToast(id ? '상담일지가 수정되었습니다.' : '상담일지가 저장되었습니다.');
        await loadJournalStats();
    } catch (e) {
        alert('저장 실패: ' + e.message);
    }
}

// ─── 삭제 ─────────────────────────────────────────────────────

async function deleteJournal(id) {
    if (!confirm('이 상담일지를 삭제하시겠습니까?')) return;
    try {
        await apiCall('DELETE', '/counseling-journals/' + id);
        await fetchJournals();
        await loadJournalStats();
        showToast('상담일지가 삭제되었습니다.');
    } catch (e) {
        alert('삭제 실패: ' + e.message);
    }
}

async function exportJournal(id, format) {
    try {
        if (format === 'docx') {
            await api.counselingJournals.docx(id, 'journal');
        } else {
            await api.counselingJournals.pdf(id, 'journal');
        }
        showToast((format === 'docx' ? 'DOCX' : 'PDF') + ' 다운로드를 시작했습니다.');
    } catch (e) {
        alert('내보내기 실패: ' + e.message);
    }
}

async function loadJournalStats() {
    const el = document.getElementById('journalStatsBar');
    if (!el) return;
    try {
        const data = await apiCall('GET', '/counseling-journals/stats');
        const stats = data.stats || {};
        const parts = (stats.by_type || []).map((r) => `${r.type} ${r.count}건`);
        el.textContent = `총 ${stats.total || 0}건` + (parts.length ? ' · ' + parts.join(' / ') : '');
    } catch {
        el.textContent = '';
    }
}

async function setupStudentTimeline() {
    const box = document.getElementById('timelineBox');
    if (!box || !isTeacherOrAdminUser(currentUser)) return;
    box.style.display = 'block';
    try {
        const data = await apiCall('GET', '/users?user_type=student,graduate&limit=200');
        const select = document.getElementById('timelineStudentSelect');
        const users = data.users || [];
        if (!select) return;
        select.innerHTML = '<option value="">학생 선택</option>' + users.map((u) =>
            `<option value="${u.id}">${escHtml(u.name || '')} (${escHtml(u.school_name || '')})</option>`
        ).join('');
    } catch (e) {
        console.warn('타임라인 학생 목록 실패:', e.message);
    }
}

async function loadStudentTimeline() {
    const select = document.getElementById('timelineStudentSelect');
    const el = document.getElementById('studentTimeline');
    if (!select || !el) return;
    const studentId = select.value;
    if (!studentId) {
        el.textContent = '학생을 선택하세요.';
        return;
    }
    el.textContent = '불러오는 중...';
    try {
        const data = await apiCall('GET', '/counseling-journals/timeline/' + studentId);
        const journals = data.journals || [];
        if (!journals.length) {
            el.textContent = '이 학생의 상담 이력이 없습니다.';
            return;
        }
        el.innerHTML = journals.map((j) => `
            <div style="border-left:3px solid #1e40af; padding:0.5rem 0.85rem; margin-bottom:0.65rem;">
                <div style="font-size:0.8rem; color:#6b7280;">${formatDate(j.counseling_date)} · ${escHtml(j.type || '')}</div>
                <div style="font-weight:600;">${escHtml(j.title || '')}</div>
                ${j.follow_up_at ? `<div style="font-size:0.82rem; color:#15803d;">후속: ${formatDate(j.follow_up_at)}</div>` : ''}
            </div>
        `).join('');
    } catch (e) {
        el.textContent = '타임라인을 불러오지 못했습니다. ' + (e.message || '');
    }
}

// ─── 상세 모달 ────────────────────────────────────────────────

function openDetailModal(id) {
    const j = allJournals.find(x => String(x.id) === String(id));
    if (!j) return;

    document.getElementById('detailTitle').textContent = j.title || '상담일지 상세';

    const isTeacherOrAdmin = isTeacherOrAdminUser(currentUser);
    const canEdit = isTeacherOrAdmin && (
        isStaffAdminUser(currentUser) || String(j.teacher_id) === String(currentUser.id)
    );

    document.getElementById('journalDetailBody').innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
            <tr><td style="padding:0.6rem; color:#6b7280; width:120px;">상담 날짜</td><td style="padding:0.6rem;">${formatDate(j.counseling_date)}</td></tr>
            <tr><td style="padding:0.6rem; color:#6b7280;">상담 유형</td><td style="padding:0.6rem;"><span class="journal-type-badge">${escHtml(j.type || '')}</span></td></tr>
            <tr><td style="padding:0.6rem; color:#6b7280;">학생</td><td style="padding:0.6rem;">${escHtml(j.student_name || '-')}</td></tr>
            <tr><td style="padding:0.6rem; color:#6b7280;">담당 교사</td><td style="padding:0.6rem;">${escHtml(j.teacher_name || '-')}</td></tr>
        </table>
        <div style="margin-top:1rem;">
            <p style="font-weight:600; margin-bottom:0.5rem; color:#1f2937;">상담 내용</p>
            <div style="padding:0.9rem; background:#f9fafb; border-radius:6px; line-height:1.7; white-space:pre-wrap;">${escHtml(j.content || '')}</div>
        </div>
        ${j.action_taken ? `
        <div style="margin-top:1rem;">
            <p style="font-weight:600; margin-bottom:0.5rem; color:#1f2937;">조치</p>
            <div style="padding:0.9rem; background:#f9fafb; border-radius:6px; line-height:1.7; white-space:pre-wrap;">${escHtml(j.action_taken)}</div>
        </div>` : ''}
        ${j.follow_up ? `
        <div style="margin-top:1rem;">
            <p style="font-weight:600; margin-bottom:0.5rem; color:#15803d;">후속 조치 / 다음 상담 계획</p>
            <div style="padding:0.9rem; background:#f0fdf4; border-radius:6px; line-height:1.7; white-space:pre-wrap; border-left:3px solid #16a34a;">${escHtml(j.follow_up)}</div>
        </div>` : ''}
        ${j.is_private ? `<p style="margin-top:1rem; font-size:0.82rem; color:#92400e;">🔒 이 일지는 비공개로 설정되어 있습니다.</p>` : ''}
        ${canEdit ? `
        <div style="display:flex; gap:0.5rem; margin-top:1.5rem;">
            <button class="btn btn-secondary btn-sm" onclick="closeDetailModal(); openJournalModal('${j.id}')">수정</button>
            <button class="btn btn-danger btn-sm" onclick="closeDetailModal(); deleteJournal('${j.id}')">삭제</button>
        </div>` : ''}
    `;

    document.getElementById('journalDetailModal').classList.add('open');
}

function closeDetailModal() {
    document.getElementById('journalDetailModal').classList.remove('open');
}

// ─── 유틸 ─────────────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    } catch {
        return dateStr;
    }
}

function showToast(msg) {
    let toast = document.getElementById('journalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'journalToast';
        toast.style.cssText = 'position:fixed; bottom:2rem; right:2rem; background:#1e3a8a; color:#fff; padding:0.8rem 1.4rem; border-radius:8px; font-size:0.9rem; z-index:9999; opacity:0; transition:opacity 0.3s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ─── Escape key close ─────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeJournalModal();
        closeDetailModal();
    }
});
