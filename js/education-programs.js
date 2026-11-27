// 전역 변수
let currentUser = null;
let programs = [];
let editingProgramId = null;
let myApplications = new Map();

const APPLICATION_STATUS_LABEL = {
    pending: '접수',
    approved: '승인',
    rejected: '반려',
    cancelled: '취소',
};

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function safeHttpUrl(v) {
    return /^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim() : '';
}

document.addEventListener('DOMContentLoaded', async function() {
    auth.requireAuth();
    currentUser = await auth.whenUserLoaded();

    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.name;

        if (['admin', 'school_admin', 'teacher'].includes(currentUser.user_type)) {
            const adminActions = document.getElementById('adminActions');
            if (adminActions) adminActions.style.display = 'block';
        }
        if (currentUser.user_type === 'admin') {
            const adminMenuSection = document.getElementById('adminMenuSection');
            if (adminMenuSection) adminMenuSection.style.display = 'block';
        }
        const careerMenu = document.getElementById('careerMenu');
        if (careerMenu && currentUser.user_type !== 'student' && currentUser.user_type !== 'graduate') {
            careerMenu.style.display = 'none';
        }
        // 상담교사로 지정되지 않은 교사는 상담 메뉴 숨김
        if (currentUser.user_type === 'teacher' && !currentUser.is_counselor) {
            const counselingMenu = document.getElementById('counselingMenu');
            const journalMenu = document.getElementById('journalMenu');
            if (counselingMenu) counselingMenu.style.display = 'none';
            if (journalMenu) journalMenu.style.display = 'none';
        }
        // 기업 사용자는 상담 메뉴 숨김
        if (currentUser.user_type === 'company') {
            const counselingMenu = document.getElementById('counselingMenu');
            if (counselingMenu) counselingMenu.style.display = 'none';
        }
    }

    loadPrograms();

    const editProgramId = sessionStorage.getItem('editProgramId');
    if (editProgramId) {
        sessionStorage.removeItem('editProgramId');
        setTimeout(() => editProgram(Number(editProgramId)), 300);
    }

    const searchEl = document.getElementById('searchProgram');
    if (searchEl) {
        searchEl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchPrograms();
        });
    }
});

// 프로그램 로드 (API)
async function loadPrograms() {
    const grid = document.getElementById('programsGrid');
    if (grid) grid.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px;grid-column:1/-1;">불러오는 중...</p>';

    try {
        const data = await api.get('/education-programs?limit=100');
        programs = data.programs || [];
        await loadMyApplications();
        displayPrograms(programs);
    } catch (err) {
        console.error('교육프로그램 로드 실패:', err);
        if (grid) grid.innerHTML = '<p style="text-align:center;color:#ef4444;padding:40px;grid-column:1/-1;">데이터를 불러올 수 없습니다.</p>';
    }
}

async function loadMyApplications() {
    myApplications = new Map();
    if (!currentUser || !['graduate', 'student'].includes(currentUser.user_type)) return;
    try {
        const data = await api.get('/education-programs/my-applications');
        (data.applications || []).forEach((a) => myApplications.set(String(a.program_id), a));
    } catch (err) {
        console.warn('내 신청 내역 로드 실패:', err.message);
    }
}

// 프로그램 목록 표시
function displayPrograms(programList) {
    const grid = document.getElementById('programsGrid');
    if (!grid) return;

    if (programList.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#999;padding:40px;grid-column:1/-1;">등록된 프로그램이 없습니다.</p>';
        return;
    }

    const isAdmin = currentUser && (currentUser.user_type === 'admin' || currentUser.user_type === 'school_admin');
    const isTeacher = currentUser && currentUser.user_type === 'teacher';
    const canApply = currentUser && (currentUser.user_type === 'graduate' || currentUser.user_type === 'student');

    grid.innerHTML = programList.map(program => {
        const desc = program.description || '';
        const shortDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
        const isStaff = isAdmin || (isTeacher && String(program.created_by) === String(currentUser.id));
        const myApp = myApplications.get(String(program.id));
        const applyButton = !canApply ? ''
            : myApp
                ? `<button class="btn btn-secondary" disabled>신청완료 (${esc(APPLICATION_STATUS_LABEL[myApp.status] || myApp.status)})</button>`
                : `<button class="btn btn-primary" onclick="applyProgram(${Number(program.id)})">신청하기</button>`;
        return `
            <div class="program-card" data-program-id="${Number(program.id)}">
                <div class="program-header">
                    <span class="program-category">${esc(program.category || '-')}</span>
                    <span class="program-type">${esc(program.type || '-')}</span>
                </div>
                <h3 class="program-title">${esc(program.title)}</h3>
                <p class="program-description">${esc(shortDesc)}</p>
                <div class="program-meta">
                    <span>📅 ${esc(program.duration || '-')}</span>
                    ${program.instructor ? `<span>👨‍🏫 ${esc(program.instructor)}</span>` : ''}
                    ${program.cost ? `<span>💰 ${esc(program.cost)}</span>` : ''}
                    ${program.creator_name ? `<span>등록: ${esc(program.creator_name)}</span>` : ''}
                </div>
                <div class="program-actions">
                    <button class="btn btn-secondary" onclick="viewProgramDetail(${Number(program.id)})">상세보기</button>
                    ${applyButton}
                    ${isStaff ? `
                        <button class="btn btn-secondary" onclick="viewApplicants(${Number(program.id)})">신청자</button>
                        <button class="btn btn-primary" onclick="editProgram(${Number(program.id)})">수정</button>
                        <button class="btn btn-danger" onclick="deleteProgram(${Number(program.id)})">삭제</button>
                    ` : ''}
                </div>
            </div>`;
    }).join('');
}

async function applyProgram(programId) {
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    const name = prompt('신청자 이름', currentUser?.name || '');
    if (name === null) return;
    const phone = prompt('연락처', currentUser?.phone || '');
    if (phone === null) return;
    if (!name.trim() || !phone.trim()) {
        alert('이름과 연락처는 필수입니다.');
        return;
    }
    if (!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phone.trim())) {
        alert('올바른 연락처 형식이 아닙니다. (예: 010-1234-5678)');
        return;
    }
    try {
        await api.post(`/education-programs/${programId}/apply`, {
            applicant_name: name.trim(),
            applicant_phone: phone.trim(),
            applicant_email: currentUser?.email || null,
        });
        alert('신청이 완료되었습니다.');
    } catch (err) {
        alert(err.message || '신청에 실패했습니다.');
    }
    await loadMyApplications();
    displayPrograms(programs);
}
window.applyProgram = applyProgram;

async function viewApplicants(programId) {
    try {
        const data = await api.get(`/education-programs/${programId}/applications`);
        const rows = data.applications || [];
        const statusOptions = (current) => Object.entries(APPLICATION_STATUS_LABEL)
            .map(([v, label]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${label}</option>`)
            .join('');
        const body = rows.length
            ? `<table class="applicants-table" style="width:100%;border-collapse:collapse;">
                    <thead><tr><th>이름</th><th>연락처</th><th>이메일</th><th>신청일</th><th>상태</th></tr></thead>
                    <tbody>${rows.map((a) => `
                        <tr>
                            <td>${esc(a.applicant_name)}</td>
                            <td>${esc(a.applicant_phone)}</td>
                            <td>${esc(a.applicant_email || a.user_email || '-')}</td>
                            <td>${esc(String(a.created_at || '').slice(0, 10))}</td>
                            <td><select data-app-id="${Number(a.id)}" onchange="changeApplicationStatus(${Number(a.id)}, this.value, ${Number(programId)})">${statusOptions(a.status)}</select></td>
                        </tr>`).join('')}
                    </tbody>
               </table>`
            : '<p style="color:#6b7280;">신청자가 없습니다.</p>';
        document.getElementById('programDetailContainer').innerHTML = `
            <div class="program-detail">
                <div class="program-detail-header">
                    <h3>${esc(data.program?.title || '프로그램')} — 신청자 ${rows.length}명</h3>
                </div>
                <div class="program-detail-body">${body}</div>
            </div>`;
        document.getElementById('programDetailTitle').textContent = '신청자 관리';
        document.getElementById('programDetailModal').style.display = 'block';
    } catch (err) {
        alert(err.message || '신청자 목록을 불러오지 못했습니다.');
    }
}
window.viewApplicants = viewApplicants;

async function changeApplicationStatus(appId, status, programId) {
    try {
        await api.patch(`/education-programs/applications/${appId}`, { status });
    } catch (err) {
        alert(err.message || '상태 변경에 실패했습니다.');
    }
    await viewApplicants(programId);
}
window.changeApplicationStatus = changeApplicationStatus;

// 프로그램 등록 모달 열기
function openAddProgramModal() {
    editingProgramId = null;
    document.getElementById('programModalTitle').textContent = '프로그램 등록';
    document.getElementById('programForm').reset();
    document.getElementById('programId').value = '';
    document.getElementById('programModal').style.display = 'block';
}
window.openAddProgramModal = openAddProgramModal;

// 프로그램 수정
function editProgram(programId) {
    const program = programs.find(p => p.id == programId);
    if (!program) return;

    editingProgramId = programId;
    document.getElementById('programModalTitle').textContent = '프로그램 수정';
    document.getElementById('programId').value = program.id;
    document.getElementById('programTitle').value = program.title;
    document.getElementById('programCategory').value = program.category || '';
    document.getElementById('programType').value = program.type || '';
    document.getElementById('programDuration').value = program.duration || '';
    document.getElementById('programDescription').value = program.description || '';
    document.getElementById('programInstructor').value = program.instructor || '';
    document.getElementById('programCost').value = program.cost || '';
    document.getElementById('programLink').value = program.link || '';
    document.getElementById('programModal').style.display = 'block';
}
window.editProgram = editProgram;

// 프로그램 저장 (API)
async function saveProgram(event) {
    event.preventDefault();

    const programData = {
        title: document.getElementById('programTitle').value,
        category: document.getElementById('programCategory').value,
        type: document.getElementById('programType').value,
        duration: document.getElementById('programDuration').value,
        description: document.getElementById('programDescription').value,
        instructor: document.getElementById('programInstructor').value,
        cost: document.getElementById('programCost').value,
        link: document.getElementById('programLink').value
    };

    try {
        if (editingProgramId) {
            await api.put(`/education-programs/${editingProgramId}`, programData);
            alert('프로그램이 수정되었습니다.');
        } else {
            await api.post('/education-programs', programData);
            alert('프로그램이 등록되었습니다.');
        }
        closeProgramModal();
        await loadPrograms();
    } catch (err) {
        alert('저장 실패: ' + (err.message || '오류가 발생했습니다.'));
    }
}
window.saveProgram = saveProgram;

// 프로그램 삭제 (API)
async function deleteProgram(programId) {
    if (!confirm('이 프로그램을 삭제하시겠습니까?')) return;

    try {
        await api.delete(`/education-programs/${programId}`);
        alert('삭제되었습니다.');
        await loadPrograms();
    } catch (err) {
        alert('삭제 실패: ' + (err.message || '오류가 발생했습니다.'));
    }
}
window.deleteProgram = deleteProgram;

// 프로그램 상세보기 (API)
async function viewProgramDetail(programId) {
    try {
        const data = await api.get(`/education-programs/${programId}`);
        const program = data.program;
        if (!program) return;

        const container = document.getElementById('programDetailContainer');
        const createdDate = new Date(program.created_at);
        const formattedDate = `${createdDate.getFullYear()}년 ${createdDate.getMonth() + 1}월 ${createdDate.getDate()}일`;

        container.innerHTML = `
            <div class="program-detail">
                <div class="program-detail-header">
                    <div class="program-badges">
                        <span class="badge badge-category">${esc(program.category || '-')}</span>
                        <span class="badge badge-type">${esc(program.type || '-')}</span>
                    </div>
                    <h3>${esc(program.title)}</h3>
                </div>
                <div class="program-detail-body">
                    <div class="detail-section">
                        <h4>📋 프로그램 소개</h4>
                        <p>${esc(program.description || '-')}</p>
                    </div>
                    <div class="detail-section">
                        <h4>ℹ️ 프로그램 정보</h4>
                        <div class="detail-info-grid">
                            <div class="info-item"><span class="info-label">교육 기간</span><span class="info-value">${esc(program.duration || '-')}</span></div>
                            <div class="info-item"><span class="info-label">교육 유형</span><span class="info-value">${esc(program.type || '-')}</span></div>
                            ${program.instructor ? `<div class="info-item"><span class="info-label">강사/기관</span><span class="info-value">${esc(program.instructor)}</span></div>` : ''}
                            ${program.cost ? `<div class="info-item"><span class="info-label">교육 비용</span><span class="info-value">${esc(program.cost)}</span></div>` : ''}
                        </div>
                    </div>
                    ${safeHttpUrl(program.link) ? `
                        <div class="detail-section">
                            <a href="${esc(safeHttpUrl(program.link))}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block">🔗 신청 페이지로 이동</a>
                        </div>` : ''}
                    <div class="detail-footer"><small>등록일: ${formattedDate}</small></div>
                </div>
            </div>`;

        document.getElementById('programDetailTitle').textContent = '프로그램 상세';
        document.getElementById('programDetailModal').style.display = 'block';
    } catch (err) {
        alert('상세 정보를 불러올 수 없습니다.');
    }
}
window.viewProgramDetail = viewProgramDetail;

// 검색
function searchPrograms() {
    const q = document.getElementById('searchProgram').value.toLowerCase();
    const filtered = programs.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.instructor || '').toLowerCase().includes(q)
    );
    displayPrograms(filtered);
}
window.searchPrograms = searchPrograms;

// 필터
function applyFilters() {
    const category = document.getElementById('filterCategory').value;
    const type = document.getElementById('filterType').value;
    const q = document.getElementById('searchProgram').value.toLowerCase();

    let filtered = [...programs];
    if (category) filtered = filtered.filter(p => p.category === category);
    if (type) filtered = filtered.filter(p => p.type === type);
    if (q) filtered = filtered.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.instructor || '').toLowerCase().includes(q)
    );
    displayPrograms(filtered);
}
window.applyFilters = applyFilters;

// 모달 닫기
function closeProgramModal() {
    document.getElementById('programModal').style.display = 'none';
    editingProgramId = null;
}
window.closeProgramModal = closeProgramModal;

function closeProgramDetailModal() {
    document.getElementById('programDetailModal').style.display = 'none';
}
window.closeProgramDetailModal = closeProgramDetailModal;
