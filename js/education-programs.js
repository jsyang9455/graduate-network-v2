// 전역 변수
let currentUser = null;
let programs = [];
let editingProgramId = null;

document.addEventListener('DOMContentLoaded', async function() {
    auth.requireAuth();
    currentUser = await auth.whenUserLoaded();

    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.name;

        if (currentUser.user_type === 'admin' || currentUser.user_type === 'teacher') {
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
        displayPrograms(programs);
    } catch (err) {
        console.error('교육프로그램 로드 실패:', err);
        if (grid) grid.innerHTML = '<p style="text-align:center;color:#ef4444;padding:40px;grid-column:1/-1;">데이터를 불러올 수 없습니다.</p>';
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

    const isAdmin = currentUser && (currentUser.user_type === 'admin' || currentUser.user_type === 'teacher');

    grid.innerHTML = programList.map(program => {
        const desc = program.description || '';
        const shortDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
        return `
            <div class="program-card">
                <div class="program-header">
                    <span class="program-category">${program.category || '-'}</span>
                    <span class="program-type">${program.type || '-'}</span>
                </div>
                <h3 class="program-title">${program.title}</h3>
                <p class="program-description">${shortDesc}</p>
                <div class="program-meta">
                    <span>📅 ${program.duration || '-'}</span>
                    ${program.instructor ? `<span>👨‍🏫 ${program.instructor}</span>` : ''}
                    ${program.cost ? `<span>💰 ${program.cost}</span>` : ''}
                </div>
                <div class="program-actions">
                    <button class="btn btn-secondary" onclick="viewProgramDetail(${program.id})">상세보기</button>
                    ${isAdmin ? `
                        <button class="btn btn-primary" onclick="editProgram(${program.id})">수정</button>
                        <button class="btn btn-danger" onclick="deleteProgram(${program.id})">삭제</button>
                    ` : ''}
                </div>
            </div>`;
    }).join('');
}

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
                        <span class="badge badge-category">${program.category || '-'}</span>
                        <span class="badge badge-type">${program.type || '-'}</span>
                    </div>
                    <h3>${program.title}</h3>
                </div>
                <div class="program-detail-body">
                    <div class="detail-section">
                        <h4>📋 프로그램 소개</h4>
                        <p>${program.description || '-'}</p>
                    </div>
                    <div class="detail-section">
                        <h4>ℹ️ 프로그램 정보</h4>
                        <div class="detail-info-grid">
                            <div class="info-item"><span class="info-label">교육 기간</span><span class="info-value">${program.duration || '-'}</span></div>
                            <div class="info-item"><span class="info-label">교육 유형</span><span class="info-value">${program.type || '-'}</span></div>
                            ${program.instructor ? `<div class="info-item"><span class="info-label">강사/기관</span><span class="info-value">${program.instructor}</span></div>` : ''}
                            ${program.cost ? `<div class="info-item"><span class="info-label">교육 비용</span><span class="info-value">${program.cost}</span></div>` : ''}
                        </div>
                    </div>
                    ${program.link ? `
                        <div class="detail-section">
                            <a href="${program.link}" target="_blank" class="btn btn-primary btn-block">🔗 신청 페이지로 이동</a>
                        </div>` : ''}
                    <div class="detail-footer"><small>등록일: ${formattedDate}</small></div>
                </div>
            </div>`;

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
