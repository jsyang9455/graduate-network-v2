// 전역 변수
let currentUser = null;
let users = [];
let editingUserId = null;
let currentView = 'active'; // 'active' | 'withdrawn'
let currentPage = 1;
const PAGE_SIZE = 20;
let filteredUsers = [];

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 인증 확인
    auth.requireAuth();
    currentUser = auth.getCurrentUser();
    
    // 관리자가 아니면 접근 불가
    if (!currentUser || !auth.isStaffAdmin(currentUser)) {
        alert('관리자만 접근할 수 있습니다.');
        window.location.href = 'dashboard.html';
        return;
    }
    
    document.getElementById('userName').textContent = currentUser.name;
    
    // 회원 로드
    loadUsers();
    loadWithdrawnCount();
    loadCompanyPendingCount();

    document.getElementById('companyApprovalFilter')?.addEventListener('change', () => {
        if (currentView === 'companies') loadCompanyApprovals();
    });

    document.getElementById('searchUser')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchUsers();
        }
    });

    // 회원 유형 변경 시 상담교사 섹션 표시/숨김
    document.getElementById('editUserType')?.addEventListener('change', function() {
        const counselorSection = document.getElementById('counselorSection');
        if (counselorSection) {
            counselorSection.style.display = this.value === 'teacher' ? 'block' : 'none';
            if (this.value !== 'teacher') {
                const cb = document.getElementById('editUserIsCounselor');
                if (cb) cb.checked = false;
            }
        }
    });
});

// 회원 로드
async function loadUsers() {
    try {
        console.log('회원 목록 로드 시작...');
        currentPage = 1;
        
        const url = currentView === 'withdrawn'
            ? '/users?include_withdrawn=true&limit=1000'
            : '/users?limit=1000';
        const response = await api.get(url);
        console.log('API 응답:', response);
        
        if (response && response.users) {
            users = response.users;
            console.log('로드된 회원 수:', users.length);
        } else {
            console.warn('응답에 users 속성이 없음:', response);
            users = [];
        }
        
        if (currentView === 'active') {
            updateStats();
            // activeCount 탭 카운트 업데이트
            const el = document.getElementById('activeCount');
            if (el) el.textContent = users.length;
        } else {
            const el = document.getElementById('withdrawnCount');
            if (el) el.textContent = users.length;
        }
        displayUsers(users);
    } catch (error) {
        console.error('회원 로드 실패:', error);
        
        alert('회원 목록을 불러올 수 없습니다.');
    }
}

// 통계 업데이트
function updateStats() {
    // HTML에 통계 엘리먼트가 있는 경우에만 업데이트
    const totalUsersEl = document.getElementById('totalUsers');
    const studentCountEl = document.getElementById('studentCount');
    const teacherCountEl = document.getElementById('teacherCount');
    const companyCountEl = document.getElementById('companyCount');
    
    if (totalUsersEl) totalUsersEl.textContent = `${users.length}명`;
    if (studentCountEl) studentCountEl.textContent = `${users.filter(u => u.user_type === 'student' || u.user_type === 'graduate').length}명`;
    if (teacherCountEl) teacherCountEl.textContent = `${users.filter(u => u.user_type === 'teacher').length}명`;
    if (companyCountEl) companyCountEl.textContent = `${users.filter(u => u.user_type === 'company').length}명`;
}

// 회원 목록 표시
function displayUsers(userList) {
    filteredUsers = userList;
    renderPagination();
    const tbody = document.getElementById('usersTableBody');

    const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageUsers = filteredUsers.slice(start, start + PAGE_SIZE);

    if (pageUsers.length === 0) {
        const colCount = currentView === 'withdrawn' ? 11 : 10;
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; color: #999; padding: 40px;">회원이 없습니다.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = pageUsers.map((user, index) => {
        const index2 = start + index;
        const userTypeLabel = {
            'student': '학생',
            'graduate': '졸업생',
            'teacher': '교사',
            'company': '기업',
            'admin': '관리자'
        }[user.user_type] || user.user_type;
        
        const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-';
        const withdrawnDate = user.withdrawn_at ? new Date(user.withdrawn_at).toLocaleDateString('ko-KR') : '-';
        const withdrawReason = user.withdraw_reason || '사유 없음';
        const phone = user.phone || '-';
        const schoolName = user.school_name || user.current_company || '-';
        const major = user.major || '-';
        // 상담교사 배지 (교사 유형 + is_counselor = true 일 때)
        const counselorBadge = (user.user_type === 'teacher' && user.is_counselor)
            ? ' <span style="background:#dcfce7;color:#166534;font-size:0.72rem;padding:1px 6px;border-radius:10px;font-weight:600;">상담교사</span>'
            : '';
        const displayTypeLabel = `<span class="badge badge-${user.user_type}">${userTypeLabel}</span>${counselorBadge}`;

        if (currentView === 'withdrawn') {
            return `
                <tr style="background:#fff5f5;">
                    <td>${index2 + 1}</td>
                    <td>${user.name || '-'}</td>
                    <td>${user.email || '-'}</td>
                    <td>${displayTypeLabel}</td>
                    <td>${phone}</td>
                    <td>${schoolName}</td>
                    <td>${user.department_name || '-'}</td>
                    <td>${major}</td>
                    <td style="color:#b91c1c;font-weight:600;">${withdrawnDate}</td>
                    <td style="max-width:200px;">
                        <span title="${withdrawReason}" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;">${withdrawReason}</span>
                    </td>
                    <td>
                        <button class="btn-small" style="background:#16a34a;color:#fff;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;" onclick="restoreUser('${user.id}')">복구</button>
                        <button class="btn-small btn-primary" onclick="editUser('${user.id}')">수정</button>
                    </td>
                </tr>
            `;
        }
        
        return `
            <tr>
                <td>${index2 + 1}</td>
                <td>${user.name || '-'}</td>
                <td>${user.email || '-'}</td>
                <td>${displayTypeLabel}</td>
                <td>${phone}</td>
                <td>${schoolName}</td>
                <td>${user.department_name || '-'}</td>
                <td>${major}</td>
                <td>${joinDate}</td>
                <td>
                    <button class="btn-small btn-primary" onclick="editUser('${user.id}')">수정</button>
                    ${user.user_type !== 'admin' ? `<button class="btn-small btn-danger" onclick="deleteUser('${user.id}')">탈퇴</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// 회원 수정
function editUser(userId) {
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return;

    editingUserId = userId;
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name || '';
    document.getElementById('editUserEmail').value = user.email || '';
    document.getElementById('editUserPhone').value = user.phone || '';
    document.getElementById('editUserType').value = user.user_type || 'student';
    document.getElementById('editUserSchool').value = user.school_name || '';
    document.getElementById('editUserDept').value = user.department_name || '';
    document.getElementById('editUserMajor').value = user.major || user.gp_major || '';
    document.getElementById('editUserGradYear').value = user.graduation_year || '';
    document.getElementById('editUserDesiredJob').value = user.desired_job || '';

    // 상담교사 체크박스 설정 (교사 유형일 때만 표시)
    const counselorSection = document.getElementById('counselorSection');
    const isCounselorCheck = document.getElementById('editUserIsCounselor');
    if (counselorSection && isCounselorCheck) {
        isCounselorCheck.checked = user.is_counselor === true;
        counselorSection.style.display = user.user_type === 'teacher' ? 'block' : 'none';
    }

    document.getElementById('editUserModal').style.display = 'block';
}
window.editUser = editUser;

// 회원 저장
async function saveUser(event) {
    event.preventDefault();

    const userId = document.getElementById('editUserId').value;
    const gradYearVal = document.getElementById('editUserGradYear').value;
    const userType = document.getElementById('editUserType').value;

    const payload = {
        name:            document.getElementById('editUserName').value,
        email:           document.getElementById('editUserEmail').value,
        user_type:       userType,
        phone:           document.getElementById('editUserPhone').value,
        school_name:     document.getElementById('editUserSchool').value,
        department_name: document.getElementById('editUserDept').value,
        major:           document.getElementById('editUserMajor').value,
        graduation_year: gradYearVal ? parseInt(gradYearVal) : null,
        desired_job:     document.getElementById('editUserDesiredJob').value,
    };

    // 교사 유형인 경우만 is_counselor 포함
    if (userType === 'teacher') {
        payload.is_counselor = document.getElementById('editUserIsCounselor')?.checked === true;
    } else {
        payload.is_counselor = false;
    }

    const btn = event.submitter || document.querySelector('#editUserForm button[type="submit"]');
    const origText = btn.textContent;
    btn.textContent = '저장 중...';
    btn.disabled = true;

    try {
        await api.put(`/users/${userId}`, payload);
        alert('회원 정보가 수정되었습니다.');
        closeEditUserModal();
        loadUsers();
    } catch (error) {
        console.error('회원 수정 실패:', error);
        alert('회원 정보 수정에 실패했습니다: ' + (error.message || '다시 시도해주세요.'));
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}
document.getElementById('editUserForm')?.addEventListener('submit', saveUser);

// 회원 탈퇴
async function deleteUser(userId) {
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return;
    
    if (!confirm(`${user.name}(${user.email}) 회원을 탈퇴 처리하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    
    try {
        await api.delete(`/users/${userId}`);
        alert('회원이 탈퇴 처리되었습니다.');
        loadUsers();
    } catch (error) {
        console.error('회원 탈퇴 실패:', error);
        alert('회원 탈퇴 처리에 실패했습니다.');
    }
}
window.deleteUser = deleteUser;

// 탈퇴 회원 복구
async function restoreUser(userId) {
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return;

    if (!confirm(`${user.name}(${user.email}) 회원을 복구(재활성화)하시겠습니까?`)) return;

    try {
        await api.patch(`/users/${userId}/restore`);
        alert(`${user.name} 회원이 정상 회원으로 복구되었습니다.`);
        loadUsers();
        loadWithdrawnCount();
    } catch (error) {
        console.error('회원 복구 실패:', error);
        alert('회원 복구에 실패했습니다: ' + (error.message || '다시 시도해주세요.'));
    }
}
window.restoreUser = restoreUser;

// 검색 기능
function searchUsers() {
    filterUsers();
}
window.searchUsers = searchUsers;

// 필터 적용
function filterUsers() {
    const userType = document.getElementById('userTypeFilter')?.value || '';
    const searchQuery = (document.getElementById('searchUser')?.value || '').toLowerCase();

    let filtered = users;

    if (userType) {
        filtered = filtered.filter(u => u.user_type === userType);
    }
    if (searchQuery) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(searchQuery) ||
            (u.email || '').toLowerCase().includes(searchQuery)
        );
    }
    currentPage = 1;
    displayUsers(filtered);
}

// 페이지 이동
function goToPage(page) {
    const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE) || 1;
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    displayUsers(filteredUsers);
    document.getElementById('usersTableBody')?.closest('.table-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.goToPage = goToPage;

// 페이지네이션 렌더링
function renderPagination() {
    const container = document.getElementById('paginationContainer');
    if (!container) return;
    const total = filteredUsers.length;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    if (totalPages <= 1) {
        container.innerHTML = `<p style="text-align:center;color:#6b7280;font-size:0.875rem;">총 ${total}명</p>`;
        return;
    }

    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, total);

    // 표시할 페이지 번호 범위 (최대 5개)
    const PAGES_SHOWN = 5;
    let pageStart = Math.max(1, currentPage - Math.floor(PAGES_SHOWN / 2));
    let pageEnd = pageStart + PAGES_SHOWN - 1;
    if (pageEnd > totalPages) { pageEnd = totalPages; pageStart = Math.max(1, pageEnd - PAGES_SHOWN + 1); }

    const btnStyle = (active) => `style="padding:0.35rem 0.7rem;margin:0 2px;border:1px solid ${active ? '#3b82f6' : '#d1d5db'};background:${active ? '#3b82f6' : '#fff'};color:${active ? '#fff' : '#374151'};border-radius:6px;cursor:${active ? 'default' : 'pointer'};font-size:0.875rem;"`;

    let html = `<div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:1rem 0;">`;
    html += `<span style="margin-right:12px;color:#6b7280;font-size:0.875rem;">${start}–${end} / ${total}명</span>`;
    html += `<button onclick="goToPage(1)" ${btnStyle(false)} ${currentPage === 1 ? 'disabled' : ''}>«</button>`;
    html += `<button onclick="goToPage(${currentPage - 1})" ${btnStyle(false)} ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let p = pageStart; p <= pageEnd; p++) {
        html += `<button onclick="goToPage(${p})" ${btnStyle(p === currentPage)}>${p}</button>`;
    }
    html += `<button onclick="goToPage(${currentPage + 1})" ${btnStyle(false)} ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    html += `<button onclick="goToPage(${totalPages})" ${btnStyle(false)} ${currentPage === totalPages ? 'disabled' : ''}>»</button>`;
    html += `</div>`;
    container.innerHTML = html;
}
window.filterUsers = filterUsers;

function applyFilters() { filterUsers(); }
window.applyFilters = applyFilters;

// 모달 닫기
function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
    editingUserId = null;
}
window.closeEditUserModal = closeEditUserModal;

// 탈퇴 회원 수 로드
async function loadWithdrawnCount() {
    try {
        const response = await api.get('/users?include_withdrawn=true&limit=1&page=1');
        const count = response?.pagination?.total || 0;
        const el = document.getElementById('withdrawnCount');
        if (el) el.textContent = count;
    } catch (error) {
        console.warn('탈퇴 회원 수 조회 실패:', error.message);
        const el = document.getElementById('withdrawnCount');
        if (el) el.textContent = '0';
    }
}
window.loadWithdrawnCount = loadWithdrawnCount;

async function loadCompanyPendingCount() {
    try {
        const data = await api.users.listCompanies({ approval_status: 'pending' });
        const el = document.getElementById('companyPendingCount');
        if (el) el.textContent = (data.companies || []).length;
    } catch (error) {
        console.warn('기업 승인 대기 수 조회 실패:', error.message);
        const el = document.getElementById('companyPendingCount');
        if (el) el.textContent = '-';
    }
}
window.loadCompanyPendingCount = loadCompanyPendingCount;

async function loadCompanyApprovals() {
    const tbody = document.getElementById('companiesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#6b7280;">불러오는 중...</td></tr>';

    const status = document.getElementById('companyApprovalFilter')?.value;
    const params = {};
    if (status) params.approval_status = status;

    try {
        const data = await api.users.listCompanies(params);
        const rows = data.companies || [];
        if (status === 'pending' || !status) {
            const pendingEl = document.getElementById('companyPendingCount');
            if (pendingEl && (status === 'pending' || !status)) {
                const pendingCount = status === 'pending'
                    ? rows.length
                    : rows.filter((c) => c.approval_status === 'pending').length;
                pendingEl.textContent = pendingCount;
            }
        }

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#9ca3af;">해당 기업이 없습니다.</td></tr>';
            return;
        }

        const statusLabel = {
            pending: '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:0.8rem;">대기</span>',
            approved: '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:0.8rem;">승인</span>',
            rejected: '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:0.8rem;">반려</span>',
        };

        tbody.innerHTML = rows.map((c) => {
            const st = c.approval_status || 'pending';
            const joinDate = c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '-';
            const actions = st === 'pending' || st === 'rejected'
                ? `<button class="btn-small" style="background:#16a34a;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;margin-right:4px;" onclick="approveCompany(${c.user_id})">승인</button>
                   <button class="btn-small" style="background:#dc2626;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;" onclick="rejectCompany(${c.user_id})">반려</button>`
                : `<button class="btn-small" style="background:#6b7280;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;" onclick="rejectCompany(${c.user_id})">반려로 변경</button>`;
            return `<tr>
                <td style="padding:0.85rem;">${escHtml(c.company_name || '-')}</td>
                <td style="padding:0.85rem;">${escHtml(c.name || '-')}</td>
                <td style="padding:0.85rem;">${escHtml(c.email || '-')}</td>
                <td style="padding:0.85rem;">${escHtml(c.industry || '-')}</td>
                <td style="padding:0.85rem;">${escHtml(c.school_name || '-')}</td>
                <td style="padding:0.85rem;">${statusLabel[st] || st}</td>
                <td style="padding:0.85rem;">${joinDate}</td>
                <td style="padding:0.85rem;text-align:center;">${actions}</td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error('기업 승인 목록 실패:', error);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#b91c1c;">목록을 불러오지 못했습니다: ${escHtml(error.message || '')}</td></tr>`;
    }
}
window.loadCompanyApprovals = loadCompanyApprovals;

async function approveCompany(userId) {
    if (!confirm('이 기업을 승인하시겠습니까? 승인 후 채용 공고를 등록할 수 있습니다.')) return;
    try {
        await api.users.setCompanyApproval(userId, { status: 'approved' });
        alert('기업이 승인되었습니다.');
        loadCompanyApprovals();
        loadCompanyPendingCount();
    } catch (error) {
        alert('승인 실패: ' + (error.message || ''));
    }
}
window.approveCompany = approveCompany;

async function rejectCompany(userId) {
    const reason = prompt('반려 사유를 입력하세요.');
    if (reason == null) return;
    if (!String(reason).trim()) {
        alert('반려 사유가 필요합니다.');
        return;
    }
    try {
        await api.users.setCompanyApproval(userId, {
            status: 'rejected',
            rejection_reason: String(reason).trim(),
        });
        alert('기업이 반려 처리되었습니다.');
        loadCompanyApprovals();
        loadCompanyPendingCount();
    } catch (error) {
        alert('반려 실패: ' + (error.message || ''));
    }
}
window.rejectCompany = rejectCompany;

function escHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 탭 전환 (활성/기업승인/탈퇴)
function switchUserTab(tab) {
    currentView = tab;

    const tabs = {
        active: document.getElementById('tabActive'),
        companies: document.getElementById('tabCompanies'),
        withdrawn: document.getElementById('tabWithdrawn'),
    };
    Object.entries(tabs).forEach(([key, el]) => {
        if (!el) return;
        el.classList.toggle('active', key === tab);
    });

    const userFilter = document.getElementById('userFilterSection');
    const companyFilter = document.getElementById('companyApprovalFilters');
    const usersWrap = document.getElementById('usersTableWrap');
    const companiesWrap = document.getElementById('companiesTableWrap');

    if (tab === 'companies') {
        if (userFilter) userFilter.style.display = 'none';
        if (companyFilter) companyFilter.style.display = 'flex';
        if (usersWrap) usersWrap.style.display = 'none';
        if (companiesWrap) companiesWrap.style.display = 'block';
        loadCompanyApprovals();
        return;
    }

    if (userFilter) userFilter.style.display = 'flex';
    if (companyFilter) companyFilter.style.display = 'none';
    if (usersWrap) usersWrap.style.display = 'block';
    if (companiesWrap) companiesWrap.style.display = 'none';

    // 컬럼 헤더 가시성 토글
    const thJoinDate = document.getElementById('thJoinDate');
    const thWithdrawnDate = document.getElementById('thWithdrawnDate');
    const thWithdrawReason = document.getElementById('thWithdrawReason');
    if (tab === 'withdrawn') {
        if (thJoinDate) thJoinDate.style.display = 'none';
        if (thWithdrawnDate) thWithdrawnDate.style.display = '';
        if (thWithdrawReason) thWithdrawReason.style.display = '';
    } else {
        if (thJoinDate) thJoinDate.style.display = '';
        if (thWithdrawnDate) thWithdrawnDate.style.display = 'none';
        if (thWithdrawReason) thWithdrawReason.style.display = 'none';
    }

    loadUsers();
}
window.switchUserTab = switchUserTab;
