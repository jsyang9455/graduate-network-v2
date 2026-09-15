// Dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!auth.requireAuth()) {
        return;
    }

    // Display user name and customize dashboard based on user type
    const user = auth.getCurrentUser();
    
    // Update welcome message
    const welcomeMessage = document.getElementById('welcomeMessage');
    const welcomeSubtext = document.getElementById('welcomeSubtext');
    if (welcomeMessage && user) {
        welcomeMessage.textContent = `환영합니다, ${user.name}님!`;
        
        const hour = new Date().getHours();
        let greeting = '좋은 하루 되세요';
        if (hour < 12) greeting = '좋은 아침입니다';
        else if (hour < 18) greeting = '좋은 오후입니다';
        else greeting = '좋은 저녁입니다';
        
        if (welcomeSubtext) {
            welcomeSubtext.textContent = greeting;
        }
    }

    // Show admin menu if user is admin
    if (user && user.user_type === 'admin') {
        const adminMenuSection = document.getElementById('adminMenuSection');
        if (adminMenuSection) {
            adminMenuSection.style.display = 'block';
        }
    }

    // Show appropriate dashboard based on user type
    console.log('Current user:', user);
    console.log('User type:', user ? user.user_type : 'none');
    
    if (user && user.user_type === 'admin') {
        showAdminDashboard();
    } else if (user && user.user_type === 'company') {
        showCompanyDashboard();
        hideStudentMenuItems();
    } else if (user && user.user_type === 'teacher') {
        showTeacherDashboard();
    } else {
        // student, graduate, or other types
        showDefaultDashboard();
    }

    // Setup event listeners
    setupJobApplications();
});

function showDefaultDashboard() {
    const defaultDashboard = document.getElementById('defaultDashboard');
    const companyDashboard = document.getElementById('companyDashboard');
    
    if (defaultDashboard) defaultDashboard.style.display = 'block';
    if (companyDashboard) companyDashboard.style.display = 'none';
    
    // Load student/graduate dashboard data
    loadStudentStats();
    loadRecommendedJobs();
    loadRecentNews();
    loadEducationPrograms();
    loadInAppNotifications();
}

function hideStudentMenuItems() {
    // Hide counseling / career / journal for company users; show company tools
    const counselingMenu = document.getElementById('counselingMenu');
    const careerMenu = document.getElementById('careerMenu');
    const journalMenu = document.getElementById('journalMenu');
    const companyProfileMenu = document.getElementById('companyProfileMenu');
    const companyJobCreateMenu = document.getElementById('companyJobCreateMenu');
    const companyCounselingSection = document.getElementById('companyCounselingSection');

    if (counselingMenu) counselingMenu.style.display = 'none';
    if (careerMenu) careerMenu.style.display = 'none';
    if (journalMenu) journalMenu.style.display = 'none';
    if (companyProfileMenu) companyProfileMenu.style.display = '';
    if (companyJobCreateMenu) companyJobCreateMenu.style.display = '';
    if (companyCounselingSection) companyCounselingSection.style.display = 'none';
}

function hideCareerMenuForTeacher() {
    // Hide career menu for teacher users
    const careerMenu = document.getElementById('careerMenu');
    if (careerMenu) careerMenu.style.display = 'none';
}

function showTeacherDashboard() {
    hideCareerMenuForTeacher();

    // 상담교사로 지정되지 않은 교사는 상담 메뉴 숨김
    const user = auth.getCurrentUser();
    if (user && !user.is_counselor) {
        const counselingMenu = document.getElementById('counselingMenu');
        const journalMenu = document.getElementById('journalMenu');
        if (counselingMenu) counselingMenu.style.display = 'none';
        if (journalMenu) journalMenu.style.display = 'none';
    }
    const defaultDashboard = document.getElementById('defaultDashboard');
    const companyDashboard = document.getElementById('companyDashboard');
    
    // Show company dashboard for teachers (same as company users)
    if (defaultDashboard) defaultDashboard.style.display = 'none';
    if (companyDashboard) {
        companyDashboard.style.display = 'block';
        
        // Customize welcome message for teachers
        const welcomeMessage = document.getElementById('welcomeMessage');
        if (welcomeMessage) {
            const user = auth.getCurrentUser();
            welcomeMessage.textContent = `환영합니다, ${user.name} 선생님!`;
        }
        
        // 교사 전용 통계 카드 레이블·아이콘 변경
        const statCards = companyDashboard.querySelectorAll('.stat-card');
        if (statCards.length >= 4) {
            statCards[0].querySelector('.stat-icon').textContent = '📚';
            statCards[0].querySelector('.stat-info p').textContent = '진행 중 프로그램';
            statCards[1].querySelector('.stat-icon').textContent = '🙋';
            statCards[1].querySelector('.stat-info p').textContent = '참여 학생 수';
            statCards[2].querySelector('.stat-icon').textContent = '💬';
            statCards[2].querySelector('.stat-info p').textContent = '상담 진행 건수';
            statCards[3].querySelector('.stat-icon').textContent = '🎓';
            statCards[3].querySelector('.stat-info p').textContent = '수료 완료 학생';
        }
        
        // 내 채용공고 섹션: 헤더 변경 + 버튼 변경
        const jobPostingsSection = document.getElementById('jobPostingsList')?.closest('.dashboard-section');
        if (jobPostingsSection) {
            jobPostingsSection.style.display = 'block';
            const h2 = jobPostingsSection.querySelector('.section-header h2');
            if (h2) h2.textContent = '📋 내 채용공고';
            const createBtn = jobPostingsSection.querySelector('#createJobBtn');
            if (createBtn) {
                createBtn.textContent = '채용공고 등록';
                createBtn.onclick = () => window.location.href = 'job-create.html';
            }
        }

        // 상담한 학생 내역 섹션: 헤더 변경
        const applicantsSection = document.getElementById('recentApplicantsList')?.closest('.dashboard-section');
        if (applicantsSection) {
            applicantsSection.style.display = 'block';
            const h2 = applicantsSection.querySelector('.section-header h2');
            if (h2) h2.textContent = '💬 상담한 학생 내역';
            const link = applicantsSection.querySelector('.section-link');
            if (link) link.href = 'counseling.html';
        }

        // 평생교육프로그램 섹션 헤더 확인
        const eduSection = document.getElementById('educationProgramsCompany')?.closest('.dashboard-section');
        if (eduSection) {
            const h2 = eduSection.querySelector('.section-header h2');
            if (h2) h2.textContent = '🎓 JJOBB 교육프로그램';
        }

        // 최근 소식 섹션은 교사에게 불필요 → 숨김
        const newsSection = document.getElementById('recentNewsCompany')?.closest('.dashboard-section');
        if (newsSection) newsSection.style.display = 'none';
    }

    // 교사 전용 통계 데이터 로드
    loadTeacherDashboardStats();
    loadJobPostings();  // 교사 등록 채용공고 (API에서 로드)
    loadTeacherCounseledStudents();
    loadTeacherCounselingRequests();
    loadEducationProgramsForCompany();
    loadTeacherCounselingJournal();

    // 상담일지 섹션 표시
    const journalSection = document.getElementById('journalSection');
    if (journalSection) journalSection.style.display = '';

    setupCompanyEventListeners();
}

function showAdminDashboard() {
    const defaultDashboard = document.getElementById('defaultDashboard');
    const companyDashboard = document.getElementById('companyDashboard');
    
    // Show default dashboard for admins
    if (defaultDashboard) defaultDashboard.style.display = 'block';
    if (companyDashboard) companyDashboard.style.display = 'none';
    
    // Customize welcome message for admin
    const welcomeMessage = document.getElementById('welcomeMessage');
    if (welcomeMessage) {
        const user = auth.getCurrentUser();
        welcomeMessage.textContent = `환영합니다, ${user.name} 관리자님!`;
    }
    
    // Load admin dashboard data
    loadAdminStats();
    loadRecommendedJobs();
    loadRecentNews();
    loadEducationPrograms();
}

async function loadAdminStats() {
    const user = auth.getCurrentUser();
    if (!user) return;

    // 전체 채용공고 수 - API에서 로드
    try {
        const data = await api.get('/jobs?status=all&limit=1');
        const totalJobsElement = document.getElementById('appliedJobsCount');
        if (totalJobsElement) totalJobsElement.textContent = (data.pagination && data.pagination.total) || (data.jobs || []).length;
    } catch (e) {
        const el = document.getElementById('appliedJobsCount');
        if (el) el.textContent = 0;
    }

    // 전체 유저 수
    try {
        const uData = await api.get('/users?limit=1');
        const totalUsersElement = document.getElementById('networkCount');
        if (totalUsersElement) totalUsersElement.textContent = (uData.pagination && uData.pagination.total) || (uData.users || []).length;
    } catch (e) {
        const el = document.getElementById('networkCount');
        if (el) el.textContent = 0;
    }

    // 상담 건수
    try {
        const cData = await api.get('/counseling');
        const counselingCountElement = document.getElementById('savedJobsCount');
        if (counselingCountElement) counselingCountElement.textContent = (cData.sessions || []).length;
    } catch (e) {
        const el = document.getElementById('savedJobsCount');
        if (el) el.textContent = 0;
    }
}

function loadTeacherStats() {
    // legacy: not used anymore, replaced by loadTeacherDashboardStats()
}

async function loadTeacherDashboardStats() {
    const user = auth.getCurrentUser();
    if (!user) return;

    // 진행 중 프로그램 수 (API)
    try {
        const pData = await api.get('/education-programs?limit=200');
        const myPrograms = (pData.programs || []).filter(p => String(p.created_by) === String(user.id));
        const el = document.getElementById('activeJobCount');
        if (el) el.textContent = myPrograms.length;
        const hiredEl = document.getElementById('hiredCount');
        if (hiredEl) hiredEl.textContent = myPrograms.length;
        const totalApplicantsEl = document.getElementById('totalApplicants');
        if (totalApplicantsEl) totalApplicantsEl.textContent = myPrograms.length;
    } catch (e) {
        ['activeJobCount','hiredCount','totalApplicants'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=0; });
    }

    // 상담 진행 건수 (API)
    try {
        const cData = await api.get('/counseling');
        const sessions = cData.sessions || [];
        const el = document.getElementById('totalViews');
        if (el) el.textContent = sessions.length;
    } catch (e) {
        const el = document.getElementById('totalViews');
        if (el) el.textContent = 0;
    }
}

// 교사 전용: 내가 등록한 교육프로그램 목록 표시 (수정/삭제 포함)
async function loadTeacherMyPrograms() {
    const user = auth.getCurrentUser();
    if (!user) return;

    const container = document.getElementById('jobPostingsList');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">불러오는 중...</p>';

    try {
        const pData = await api.get('/education-programs?limit=200');
        const myPrograms = (pData.programs || []).filter(p => String(p.created_by) === String(user.id));

        if (myPrograms.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">등록된 교육프로그램이 없습니다. 우측 상단 버튼을 눌러 등록해보세요.</p>';
            return;
        }

        container.innerHTML = myPrograms.map(program => `
            <div class="job-posting-item">
                <div class="job-posting-info">
                    <div class="job-posting-title">${program.title}</div>
                    <div class="job-posting-meta">
                        <span class="job-status active">${program.category || '-'}</span>
                        <span>${program.type || '-'}</span>
                        <span>기간: ${program.duration || '-'}</span>
                        <span>수강료: ${program.cost || '무료'}</span>
                    </div>
                </div>
                <div class="job-posting-actions">
                    <button class="btn btn-secondary" onclick="teacherEditProgram('${program.id}')">수정</button>
                    <button class="btn btn-danger" onclick="teacherDeleteProgram('${program.id}')">삭제</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p style="text-align:center;color:#ef4444;padding:2rem;">데이터를 불러올 수 없습니다.</p>';
    }
}

async function teacherDeleteProgram(programId) {
    if (!confirm('이 프로그램을 삭제하시겠습니까?')) return;
    try {
        await api.delete(`/education-programs/${programId}`);
        alert('삭제되었습니다.');
        await loadTeacherMyPrograms();
        await loadTeacherDashboardStats();
    } catch (err) {
        alert('삭제 실패: ' + (err.message || '오류가 발생했습니다.'));
    }
}
window.teacherDeleteProgram = teacherDeleteProgram;

function teacherEditProgram(programId) {
    sessionStorage.setItem('editProgramId', programId);
    window.location.href = 'education-programs.html';
}
window.teacherEditProgram = teacherEditProgram;

// 교사 전용: 상담한 학생 내역 (API)
async function loadTeacherCounseledStudents() {
    const container = document.getElementById('recentApplicantsList');
    if (!container) return;

    try {
        const data = await api.get('/counseling');
        const sessions = (data.sessions || []).filter(s => s.status && s.status !== 'pending').slice(0, 5);

        if (sessions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">상담한 학생 내역이 없습니다.</p>';
            return;
        }

        container.innerHTML = sessions.map(s => {
            const statusText = s.status === 'approved' ? '승인됨' : s.status === 'completed' ? '완료됨' : '거절됨';
            const statusClass = s.status === 'approved' || s.status === 'completed' ? 'interview' : 'rejected';
            const date = new Date(s.updated_at || s.created_at).toLocaleDateString('ko-KR');
            return `
                <div class="applicant-item">
                    <div class="applicant-info">
                        <h4>${s.student_name || s.requester_name || '학생'}</h4>
                        <p>${s.title || s.subject || ''}</p>
                        <span class="applicant-status ${statusClass}">${statusText}</span>
                        <p style="margin-top:0.5rem;font-size:0.85rem;">처리일: ${date}</p>
                    </div>
                    <div class="applicant-actions">
                        <a href="counseling.html" class="btn btn-secondary">상세보기</a>
                    </div>
                </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">데이터를 불러올 수 없습니다.</p>';
    }
}

async function loadStudentStats() {
    const user = auth.getCurrentUser();
    if (!user) return;

    // 활성 채용공고 수 - API에서 로드
    try {
        const data = await api.get('/jobs?status=active&limit=1');
        const newJobCount = document.getElementById('newJobCount');
        if (newJobCount) newJobCount.textContent = (data.pagination && data.pagination.total) || (data.jobs || []).length;
    } catch (e) {
        const el = document.getElementById('newJobCount');
        if (el) el.textContent = 0;
    }

    // 내가 지원한 공고 수 - API에서 로드
    try {
        const appData = await api.get('/jobs/my/applications');
        const applicationCount = document.getElementById('applicationCount');
        if (applicationCount) applicationCount.textContent = (appData.applications || []).length;
    } catch (e) {
        const el = document.getElementById('applicationCount');
        if (el) el.textContent = 0;
    }

    // 네트워크 연결 수 (API)
    try {
        const connData = await api.get('/networking/connections');
        const networkCount = document.getElementById('networkCount');
        if (networkCount) networkCount.textContent = (connData.connections || []).length;
    } catch (e) {
        const el = document.getElementById('networkCount');
        if (el) el.textContent = 0;
    }

    // 받은 메시지 수 (API)
    try {
        const msgData = await api.get('/messages/inbox');
        const unreadCount = (msgData.messages || []).filter(m => !m.is_read).length;
        const messageCount = document.getElementById('messageCount');
        if (messageCount) messageCount.textContent = unreadCount;
    } catch (e) {
        const el = document.getElementById('messageCount');
        if (el) el.textContent = 0;
    }
}

async function loadInAppNotifications() {
    const el = document.getElementById('inAppNotifications');
    if (!el) return;
    try {
        const data = await api.notifications.list();
        const items = data.notifications || [];
        if (!items.length) {
            el.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 1.5rem;">새 알림이 없습니다.</p>';
            return;
        }
        el.innerHTML = items.slice(0, 8).map((n) => `
            <div class="news-item" ${n.link ? `style="cursor:pointer;" onclick="location.href='${n.link}'"` : ''}>
                <h4>${n.title || '알림'}</h4>
                <p>${n.message || ''}</p>
                <span style="font-size:0.8rem;color:#6b7280;">${n.created_at ? String(n.created_at).substring(0, 16) : ''}${n.is_read ? '' : ' · 새 알림'}</span>
            </div>
        `).join('');
    } catch (e) {
        el.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 1.5rem;">알림을 불러오지 못했습니다.</p>';
    }
}

async function loadRecommendedJobs() {
    const recommendedJobsContainer = document.getElementById('recommendedJobs');
    if (!recommendedJobsContainer) return;

    recommendedJobsContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">불러오는 중...</p>';

    try {
        // Sprint 4: explainable recommendations feed (REQ-REC-004)
        let items = [];
        try {
            const data = await api.get('/recommendations/me?limit=3');
            items = (data.recommendations || []).map((r) => ({
                ...(r.job || {}),
                score: r.score,
                reasons: r.reasons || [],
            }));
        } catch (_) {
            const data = await api.get('/jobs?status=active&limit=3');
            items = data.jobs || [];
        }

        if (items.length === 0) {
            recommendedJobsContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">추천 채용공고가 없습니다. 이력서를 등록하면 맞춤 추천이 생성됩니다.</p>';
            return;
        }

        recommendedJobsContainer.innerHTML = items.map(job => {
            const deadline = job.deadline ? String(job.deadline).substring(0, 10) : '상시채용';
            const salary = job.salary_range || '협의';
            const desc = (job.description || '');
            const shortDesc = desc.length > 80 ? desc.substring(0, 80) + '...' : desc;
            const reasonText = Array.isArray(job.reasons) && job.reasons.length
                ? job.reasons.slice(0, 2).map((x) => x.label || x.code).join(' · ')
                : '';
            return `
            <div class="job-card">
                <div class="job-card-header">
                    <h3>${job.company_name || '-'}</h3>
                    <span class="job-badge">${job.score != null ? '추천 ' + Number(job.score).toFixed(2) : '모집중'}</span>
                </div>
                <div class="job-card-body">
                    <h4>${job.title || '-'}</h4>
                    <div class="job-meta">
                        <span>📍 ${job.location || '위치 미정'}</span>
                        <span>💰 ${salary}</span>
                        <span>📅 ${deadline}</span>
                    </div>
                    <p class="job-description">${shortDesc}</p>
                    ${reasonText ? `<p class="job-description" style="color:#1d4ed8;font-size:0.85rem;">사유: ${reasonText}</p>` : ''}
                </div>
                <div class="job-card-footer">
                    <button class="btn btn-primary btn-sm" onclick="location.href='jobs.html'">지원하기</button>
                    <button class="btn btn-secondary btn-sm" onclick="location.href='jobs.html'">자세히보기</button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        console.error('추천 채용공고 로드 실패:', e);
        recommendedJobsContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">채용공고를 불러올 수 없습니다.</p>';
    }
}

function showCompanyDashboard() {
    const defaultDashboard = document.getElementById('defaultDashboard');
    const companyDashboard = document.getElementById('companyDashboard');
    
    if (defaultDashboard) defaultDashboard.style.display = 'none';
    if (companyDashboard) companyDashboard.style.display = 'block';
    
    // Load company dashboard data
    loadCompanyApprovalBanner();
    loadCompanyStats();
    loadCompanyJobPostings();
    loadRecentApplicants();
    setupCompanyEventListeners();
}

async function loadCompanyApprovalBanner() {
    const host = document.getElementById('companyDashboard');
    if (!host) return;
    let existing = document.getElementById('companyApprovalDashBanner');
    if (existing) existing.remove();

    try {
        const data = await api.users.getCompanyProfile();
        const status = data.profile?.approval_status || 'pending';
        if (status === 'approved') return;

        const banner = document.createElement('div');
        banner.id = 'companyApprovalDashBanner';
        banner.className = status === 'rejected'
            ? 'status-banner status-banner--rejected'
            : 'status-banner status-banner--pending';
        banner.setAttribute('role', 'status');
        banner.innerHTML = status === 'rejected'
            ? '기업 승인이 반려되었습니다. <a href="company-profile.html">프로필</a>을 확인한 뒤 학교 관리자에게 문의하세요.'
            : '<strong>승인 대기 중</strong> — 학교 관리자 승인 전에는 채용 공고를 등록할 수 없습니다. <a href="company-profile.html">기업 프로필</a>';
        host.insertBefore(banner, host.firstChild);
    } catch (e) {
        console.warn('approval banner:', e.message);
    }
}

async function loadCompanyStats() {
    const user = auth.getCurrentUser();
    if (!user) return;

    try {
        const data = await api.get('/jobs?status=all&limit=200');
        const myJobs = (data.jobs || []).filter(j => String(j.company_id) === String(user.id));

        const activeJobs = myJobs.filter(j => j.status === 'active').length;
        const totalApplicants = myJobs.reduce((sum, j) => sum + (j.applications_count || 0), 0);
        const totalViews = myJobs.reduce((sum, j) => sum + (j.views_count || 0), 0);

        const activeJobCount = document.getElementById('activeJobCount');
        const totalApplicantsEl = document.getElementById('totalApplicants');
        const totalViewsEl = document.getElementById('totalViews');

        if (activeJobCount) activeJobCount.textContent = activeJobs;
        if (totalApplicantsEl) totalApplicantsEl.textContent = totalApplicants;
        if (totalViewsEl) totalViewsEl.textContent = totalViews;
    } catch (e) {
        console.error('회사 통계 로드 실패:', e);
    }
}

function loadCompanyJobPostings() {
    loadJobPostings();
}

async function loadJobPostings() {
    const jobPostingsList = document.getElementById('jobPostingsList');
    if (!jobPostingsList) return;
    
    const user = auth.getCurrentUser();
    jobPostingsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">불러오는 중...</p>';

    try {
        // API에서 전체 공고 불러와서 본인 것만 필터
        const data = await api.get('/jobs?status=all&limit=200');
        let jobs = (data.jobs || []).filter(j => String(j.company_id) === String(user.id));

        if (jobs.length === 0) {
            jobPostingsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">등록된 채용 공고가 없습니다.</p>';
            return;
        }

        jobPostingsList.innerHTML = jobs.map(job => {
            const statusLabel = job.status === 'active' ? '모집중' : job.status === 'closed' ? '마감완료' : '기간만료';
            const title = job.title || '제목 없음';
            const deadline = job.deadline ? String(job.deadline).substring(0, 10) : '-';
            return `
            <div class="job-posting-item">
                <div class="job-posting-info">
                    <div class="job-posting-title">${title}</div>
                    <div class="job-posting-meta">
                        <span class="job-status ${job.status}">${statusLabel}</span>
                        <span>지원자: ${job.applications_count || 0}명</span>
                        <span>조회: ${job.views_count || 0}회</span>
                        <span>마감: ${deadline}</span>
                    </div>
                </div>
                <div class="job-posting-actions">
                    <button class="btn btn-secondary" onclick="window.location.href='jobs.html'">보기</button>
                    <button class="btn btn-primary" onclick="window.location.href='job-edit.html?id=${job.id}'">수정</button>
                </div>
            </div>`;
        }).join('');

        // Update stats
        const activeJobs = jobs.filter(j => j.status === 'active').length;
        const totalApplicants = jobs.reduce((sum, j) => sum + (j.applications_count || 0), 0);
        const totalViews = jobs.reduce((sum, j) => sum + (j.views_count || 0), 0);

        if (document.getElementById('activeJobCount')) {
            document.getElementById('activeJobCount').textContent = activeJobs;
        }
        if (document.getElementById('totalApplicants')) {
            document.getElementById('totalApplicants').textContent = totalApplicants;
        }
        if (document.getElementById('totalViews')) {
            document.getElementById('totalViews').textContent = totalViews;
        }
    } catch (e) {
        console.error('채용 공고 로드 실패:', e);
        jobPostingsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">채용 공고를 불러오지 못했습니다.</p>';
    }
}

function viewJob(jobId) {
    // job-detail.html 대신 jobs.html로 이동 (상세 페이지는 추후 구현)
    window.location.href = 'jobs.html';
}

function editJob(jobId) {
    window.location.href = `job-edit.html?id=${jobId}`;
}

async function loadRecentApplicants() {
    const applicantsList = document.getElementById('recentApplicantsList');
    if (!applicantsList) return;

    const user = auth.getCurrentUser();
    if (!user) return;
    applicantsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">불러오는 중...</p>';

    const statusLabel = {
        pending: '접수',
        reviewed: '서류검토',
        interviewed: '면접',
        accepted: '합격',
        rejected: '불합격',
    };
    const statusClass = {
        pending: 'applied',
        reviewed: 'applied',
        interviewed: 'interview',
        accepted: 'interview',
        rejected: 'rejected',
    };

    try {
        const data = await api.get('/jobs?status=all&limit=50');
        const myJobs = (data.jobs || []).filter((j) => String(j.company_id) === String(user.id));
        const collected = [];
        for (const job of myJobs.slice(0, 8)) {
            const appData = await api.get(`/jobs/${job.id}/applicants`);
            (appData.applicants || []).forEach((a) => {
                collected.push({
                    id: a.id,
                    name: a.name,
                    position: job.title,
                    status: a.application_status,
                    appliedDate: a.applied_at ? String(a.applied_at).substring(0, 10) : '',
                    resumeUrl: a.resume_url,
                });
            });
        }
        collected.sort((x, y) => String(y.appliedDate).localeCompare(String(x.appliedDate)));
        const slice = collected.slice(0, 8);
        if (!slice.length) {
            applicantsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">최근 지원자가 없습니다.</p>';
            return;
        }
        applicantsList.innerHTML = slice.map((applicant) => `
            <div class="applicant-item">
                <div class="applicant-info">
                    <h4>${applicant.name || '-'}</h4>
                    <p>${applicant.position || ''}</p>
                    <span class="applicant-status ${statusClass[applicant.status] || ''}">${statusLabel[applicant.status] || applicant.status || '-'}</span>
                    <p style="margin-top: 0.5rem; font-size: 0.85rem;">신청일: ${applicant.appliedDate || '-'}</p>
                </div>
                <div class="applicant-actions">
                    ${applicant.resumeUrl ? `<a class="btn btn-secondary" href="${applicant.resumeUrl}" target="_blank" rel="noopener">이력서</a>` : ''}
                    <button class="btn btn-primary" onclick="manageApplicant('${applicant.id}')">상태 변경</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('최근 지원자 로드 실패:', e);
        applicantsList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">지원자 정보를 불러오지 못했습니다.</p>';
    }
}

function viewResume(applicantId) {
    alert('이력서 보기 기능은 준비중입니다.');
}

function manageApplicant(applicantId) {
    window.location.href = `applicant-detail.html?id=${applicantId}`;
}

function setupCompanyEventListeners() {
    // Create job button
    const createJobBtn = document.getElementById('createJobBtn');
    if (createJobBtn) {
        createJobBtn.addEventListener('click', function() {
            window.location.href = 'job-create.html';
        });
    }
    
    // Quick action buttons with specific IDs
    const quickJobCreate = document.getElementById('quickJobCreate');
    if (quickJobCreate) {
        quickJobCreate.addEventListener('click', function() {
            window.location.href = 'job-create.html';
        });
    }
    
    const quickApplicantManage = document.getElementById('quickApplicantManage');
    if (quickApplicantManage) {
        quickApplicantManage.addEventListener('click', function() {
            window.location.href = 'jobs.html';
        });
    }
    
    const quickTalentPool = document.getElementById('quickTalentPool');
    if (quickTalentPool) {
        quickTalentPool.addEventListener('click', function() {
            alert('인재풀 기능은 준비중입니다.');
        });
    }
    
    const quickAnalytics = document.getElementById('quickAnalytics');
    if (quickAnalytics) {
        quickAnalytics.addEventListener('click', function() {
            alert('분석 기능은 준비중입니다.');
        });
    }
}

async function loadTeacherCounselingRequests() {
    const user = auth.getCurrentUser();
    if (!user || user.user_type !== 'teacher') return;

    const container = document.getElementById('counselingRequestsList');
    if (!container) return;

    try {
        const data = await api.get('/counseling');
        const sessions = (data.sessions || []).slice(0, 5);

        if (sessions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">상담 신청 내역이 없습니다.</p>';
            return;
        }

        container.innerHTML = sessions.map(s => {
            const statusText = s.status === 'pending' ? '대기중' : s.status === 'approved' ? '승인됨' : s.status === 'completed' ? '완료됨' : '거절됨';
            const statusClass = s.status === 'pending' ? 'status-pending' : s.status === 'approved' || s.status === 'completed' ? 'status-approved' : 'status-rejected';
            const date = new Date(s.created_at).toLocaleDateString('ko-KR');
            return `
                <div class="counseling-request-item">
                    <div class="request-info">
                        <h4>${s.student_name || s.requester_name || '학생'}</h4>
                        <p class="request-title">${s.title || s.subject || ''}</p>
                        <div class="request-meta">
                            <span class="request-type-badge">${s.type || ''}</span>
                            <span class="request-date">${date}</span>
                            <span class="request-status ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                    <a href="counseling.html" class="btn btn-sm btn-secondary">상세보기</a>
                </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">데이터를 불러올 수 없습니다.</p>';
    }
}

function setupJobApplications() {
    const applyButtons = document.querySelectorAll('.btn-apply');
    applyButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const jobCard = this.closest('.job-item');
            const company = jobCard.querySelector('h3').textContent;
            const position = jobCard.querySelector('p').textContent;

            if (confirm(`${company}의 ${position} 포지션에 지원하시겠습니까?`)) {
                alert('지원이 완료되었습니다!');
                // Here you would normally send the application to a server
            }
        });
    });
}

// 최근 소식 로드 (API)
async function loadRecentNews() {
    const newsContainer = document.getElementById('recentNews');
    if (!newsContainer) return;

    try {
        const data = await api.get('/posts?limit=3');
        const posts = data.posts || [];

        if (posts.length === 0) {
            newsContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">등록된 소식이 없습니다.</p>';
            return;
        }

        newsContainer.innerHTML = posts.map(post => `
            <div class="news-item" onclick="showNewsDetail(${post.id})" style="cursor: pointer;">
                <div class="news-date">${new Date(post.created_at).toLocaleDateString('ko-KR')}</div>
                <div class="news-content">
                    <h4>${post.title}</h4>
                    <p>${(post.content || '').substring(0, 80)}${post.content && post.content.length > 80 ? '...' : ''}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        newsContainer.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">소식을 불러올 수 없습니다.</p>';
    }
}

// 최근 소식 상세보기 (API) + scrap (REQ-COM-003)
let currentNewsId = null;
let currentNewsScraped = false;

async function showNewsDetail(newsId) {
    try {
        const data = await api.get(`/posts/${newsId}`);
        const post = data.post;
        if (!post) return;

        currentNewsId = post.id;
        currentNewsScraped = Boolean(data.scraped);
        document.getElementById('newsDetailTitle').textContent = post.title;
        document.getElementById('newsDetailDate').textContent = new Date(post.created_at).toLocaleDateString('ko-KR');
        document.getElementById('newsDetailContent').textContent = post.content;
        const tagsEl = document.getElementById('newsDetailTags');
        if (tagsEl) {
            const tags = Array.isArray(post.tags) ? post.tags : [];
            tagsEl.innerHTML = tags.map((t) =>
                `<span style="background:#eff6ff;color:#1d4ed8;padding:0.2rem 0.5rem;border-radius:6px;font-size:0.8rem;margin-right:0.35rem;">#${String(t).replace(/</g,'')}</span>`
            ).join('');
        }
        const scrapBtn = document.getElementById('newsScrapBtn');
        if (scrapBtn) scrapBtn.textContent = currentNewsScraped ? '스크랩 해제' : '스크랩';
        document.getElementById('newsDetailModal').style.display = 'flex';
    } catch (e) {
        alert('공지사항을 불러올 수 없습니다.');
    }
}

async function toggleNewsScrap() {
    if (!currentNewsId) return;
    try {
        if (currentNewsScraped) {
            await api.posts.unscrap(currentNewsId);
            currentNewsScraped = false;
        } else {
            await api.posts.scrap(currentNewsId);
            currentNewsScraped = true;
        }
        const scrapBtn = document.getElementById('newsScrapBtn');
        if (scrapBtn) scrapBtn.textContent = currentNewsScraped ? '스크랩 해제' : '스크랩';
    } catch (e) {
        alert(e.message || '스크랩 처리에 실패했습니다.');
    }
}

function closeNewsDetailModal() {
    document.getElementById('newsDetailModal').style.display = 'none';
    currentNewsId = null;
}

// 교육프로그램 로드 (API)
async function loadEducationPrograms() {
    const eduContainer = document.getElementById('educationPrograms');
    if (!eduContainer) return;

    try {
        const data = await api.get('/education-programs?limit=3');
        const programs = data.programs || [];

        if (programs.length === 0) {
            eduContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">등록된 교육프로그램이 없습니다.</p>';
            return;
        }

        eduContainer.innerHTML = programs.map(program => `
            <div class="news-item" onclick="showEducationDetail(${program.id})" style="cursor: pointer;">
                <div class="news-date">${program.type || ''} | ${program.duration || '-'}</div>
                <div class="news-content">
                    <h4>${program.title}</h4>
                    <p>강사: ${program.instructor || '-'} | 수강료: ${program.cost || '-'}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        eduContainer.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">교육프로그램을 불러올 수 없습니다.</p>';
    }
}

// 교육프로그램 상세보기 (API)
async function showEducationDetail(programId) {
    try {
        const data = await api.get(`/education-programs/${programId}`);
        const program = data.program;
        if (!program) return;

        document.getElementById('educationDetailTitle').textContent = program.title;
        document.getElementById('educationDetailPeriod').textContent = `${program.type || '-'} | ${program.duration || '-'}`;
        document.getElementById('educationDetailDeadline').textContent = program.category || '-';
        document.getElementById('educationDetailFee').textContent = program.cost || '-';
        document.getElementById('educationDetailDescription').textContent = program.description || '';
        document.getElementById('educationDetailModal').style.display = 'flex';
    } catch (e) {
        alert('프로그램 정보를 불러올 수 없습니다.');
    }
}

function closeEducationDetailModal() {
    document.getElementById('educationDetailModal').style.display = 'none';
}

// 회사/선생님 대시보드용 최근 소식 로드 (API)
async function loadRecentNewsForCompany() {
    const newsContainer = document.getElementById('recentNewsCompany');
    if (!newsContainer) return;

    try {
        const data = await api.get('/posts?limit=3');
        const posts = data.posts || [];

        if (posts.length === 0) {
            newsContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">등록된 소식이 없습니다.</p>';
            return;
        }

        newsContainer.innerHTML = posts.map(post => `
            <div class="news-item" onclick="showNewsDetail(${post.id})" style="cursor: pointer;">
                <div class="news-date">${new Date(post.created_at).toLocaleDateString('ko-KR')}</div>
                <div class="news-content">
                    <h4>${post.title}</h4>
                    <p>${(post.content || '').substring(0, 80)}${post.content && post.content.length > 80 ? '...' : ''}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        newsContainer.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">소식을 불러올 수 없습니다.</p>';
    }
}

// 회사/선생님 대시보드용 교육프로그램 로드 (API)
async function loadEducationProgramsForCompany() {
    const eduContainer = document.getElementById('educationProgramsCompany');
    if (!eduContainer) return;

    try {
        const data = await api.get('/education-programs?limit=3');
        const programs = data.programs || [];

        if (programs.length === 0) {
            eduContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">등록된 교육프로그램이 없습니다.</p>';
            return;
        }

        eduContainer.innerHTML = programs.map(program => `
            <div class="news-item" onclick="showEducationDetail(${program.id})" style="cursor: pointer;">
                <div class="news-date">${program.type || ''} | ${program.duration || '-'}</div>
                <div class="news-content">
                    <h4>${program.title}</h4>
                    <p>강사: ${program.instructor || '-'} | 수강료: ${program.cost || '-'}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        eduContainer.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">교육프로그램을 불러올 수 없습니다.</p>';
    }
}

// 교사 대시보드 - 상담일지 최근 3건 표시 (API 연동, localStorage 폴백)
async function loadTeacherCounselingJournal() {
    const container = document.getElementById('journalDashboardList');
    if (!container) return;

    const user = auth.getCurrentUser();
    if (!user) return;

    function escH(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderItems(journals) {
        if (journals.length === 0) {
            container.innerHTML = `<p style="text-align:center; color:#6b7280; padding:2rem;">작성된 상담일지가 없습니다.</p>`;
            return;
        }
        container.innerHTML = journals.slice(0, 3).map(j => {
            const dateStr = (j.counseling_date || j.counselingDate || '-').substring(0, 10);
            const studentName = j.student_name || j.studentName || '-';
            return `
            <div class="applicant-item" style="cursor:pointer;" onclick="window.location.href='counseling-journal.html'">
                <div class="applicant-name">${escH(j.title || '')}</div>
                <div class="applicant-info">
                    <span>📅 ${dateStr}</span>
                    <span style="margin-left:0.8rem;">👤 ${escH(studentName)}</span>
                    <span style="margin-left:0.8rem; background:#e0e7ff; color:#3730a3; padding:0.15rem 0.5rem; border-radius:12px; font-size:0.78rem;">${escH(j.type || '')}</span>
                </div>
            </div>`;
        }).join('');
    }

    try {
        const token = localStorage.getItem('token') || '';
        const apiBase = (() => {
            const h = window.location.hostname;
            if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:5000/api';
            if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return `http://${h}:5000/api`;
            return '/api';
        })();
        const res = await fetch(`${apiBase}/counseling-journals`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('API 오류');
        const data = await res.json();
        const journals = (data.journals || []).sort((a, b) =>
            new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
        );
        renderItems(journals);
    } catch (e) {
        container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem;">상담일지를 불러올 수 없습니다.</p>';
    }
}
