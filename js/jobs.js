// Jobs page functionality
let allJobs = [];
let filteredJobs = [];

document.addEventListener('DOMContentLoaded', function() {
    const user = auth.getCurrentUser();
    const onJobForm = !!(document.getElementById('jobCreateForm') || document.getElementById('jobEditForm'));

    if (onJobForm) {
        if (!auth.requireAuth()) return;
        const canPost = user && (
            user.user_type === 'company'
            || user.user_type === 'admin'
            || user.user_type === 'teacher'
            || user.user_type === 'school_admin'
            || user.role === 'school_admin'
            || user.role === 'system_admin'
        );
        if (!canPost) {
            alert('채용 공고 등록 권한이 없습니다.');
            window.location.href = 'dashboard.html';
            return;
        }
        if (document.getElementById('jobCreateForm') && user.user_type === 'company') {
            gateCompanyJobCreate(user).catch((err) => console.warn('approval gate:', err));
        }
    }

    // Hide student-only menus for company users
    if (user && user.user_type === 'company') {
        hideStudentMenuItems();
    }
    if (user && user.user_type === 'teacher') {
        hideCareerMenuForTeacher();
    }
    
    // Load jobs data
    loadJobs();
    
    setupSearch();
    setupFilters();
    setupJobApplications();
    setupJobCreateForm();
    setupJobEditForm();
});

function hideStudentMenuItems() {
    const counselingMenu = document.getElementById('counselingMenu');
    const careerMenu = document.getElementById('careerMenu');
    
    if (counselingMenu) counselingMenu.style.display = 'none';
    if (careerMenu) careerMenu.style.display = 'none';
}

function hideCareerMenuForTeacher() {
    const careerMenu = document.getElementById('careerMenu');
    if (careerMenu) careerMenu.style.display = 'none';
}

// DB 필드 → 화면 표시용 필드 정규화
function normalizeJob(j) {
    return {
        id:          j.id,
        company:     j.company_name    || '',
        companyType: j.company_size    || '',
        position:    j.title           || '',
        description: j.description     || '',
        requirements:j.requirements    || '',
        experience:  j.experience_level|| '',
        location:    j.location        || '',
        salary:      j.salary_range    || '',
        jobType:     j.job_type        || '',
        deadline:    j.deadline ? String(j.deadline).substring(0,10) : '',
        recruitCount:j.headcount       || '',
        status:      j.status          || 'active',
        views:       j.views_count     || 0,
        applicants:  j.applications_count || 0,
        company_id:  j.company_id,
    };
}

const JOB_TYPE_LABELS = { 'full-time': '정규직', 'part-time': '파트타임', contract: '계약직', internship: '인턴' };
const EXPERIENCE_LABELS = { entry: '신입', junior: '주니어', mid: '경력', senior: '시니어' };

function escHtmlJ(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function jobsListContainer() {
    return document.getElementById('jobsList') || document.querySelector('.jobs-container');
}

async function loadJobs() {
    const container = jobsListContainer();
    if (container) container.innerHTML = '<p class="jobs-empty">불러오는 중...</p>';
    try {
        const data = await api.get('/jobs');
        allJobs = (data.jobs || []).map(normalizeJob);
        filteredJobs = [...allJobs];
        displayJobs(filteredJobs);
    } catch (e) {
        console.error('채용 공고 로드 실패:', e);
        if (container) container.innerHTML = '<p class="jobs-empty jobs-empty--error">채용 공고를 불러오지 못했습니다.</p>';
    }
}

function displayJobs(jobs) {
    const container = jobsListContainer();
    if (!container) return;

    const countEl = document.getElementById('jobsCount');
    if (countEl) countEl.textContent = `${jobs.length}개의 공고`;

    if (jobs.length === 0) {
        container.innerHTML = '<p class="jobs-empty">검색 결과가 없습니다.</p>';
        return;
    }

    const user = auth.getCurrentUser();
    const isCompanyOrAdmin = user && (user.user_type === 'company' || user.user_type === 'admin' || user.user_type === 'teacher');
    
    container.innerHTML = jobs.map(job => {
        const daysLeft = job.deadline
            ? Math.ceil((new Date(job.deadline) - new Date()) / (1000 * 60 * 60 * 24))
            : null;
        let ddayText = '상시채용';
        let ddayClass = '';
        if (daysLeft !== null) {
            if (daysLeft < 0) { ddayText = '마감'; ddayClass = ' is-closed'; }
            else if (daysLeft === 0) { ddayText = 'D-Day'; ddayClass = ' is-urgent'; }
            else { ddayText = `D-${daysLeft}`; if (daysLeft <= 7) ddayClass = ' is-urgent'; }
        }
        const canEdit = isCompanyOrAdmin && (user.user_type === 'admin' || String(job.company_id) === String(user.id));
        const initial = escHtmlJ((job.company || '?').trim().charAt(0) || '?');
        const tags = [
            JOB_TYPE_LABELS[job.jobType] || job.jobType,
            EXPERIENCE_LABELS[job.experience] || job.experience,
            job.recruitCount ? `${job.recruitCount}명 채용` : '',
        ]
            .filter(Boolean)
            .map((t) => `<span class="tag">${escHtmlJ(t)}</span>`)
            .join('');
        return `
            <article class="job-card" data-job-id="${job.id}">
                <div class="job-card-top">
                    <div class="job-card-logo" aria-hidden="true">${initial}</div>
                    <span class="job-dday${ddayClass}">${ddayText}</span>
                </div>
                <h3 class="job-card-title">
                    <button type="button" class="job-card-link" onclick="viewJobDetail(${job.id})">${escHtmlJ(job.position)}</button>
                </h3>
                <p class="job-card-company">
                    ${escHtmlJ(job.company)}
                    ${job.companyType ? `<span class="job-card-sep">·</span>${escHtmlJ(job.companyType)}` : ''}
                </p>
                <p class="job-card-meta">
                    ${escHtmlJ(job.location || '지역 미정')}
                    ${job.deadline ? `<span class="job-card-sep">·</span>${escHtmlJ(job.deadline)} 마감` : ''}
                </p>
                ${job.salary ? `<p class="job-card-salary">${escHtmlJ(job.salary)}</p>` : ''}
                ${tags ? `<div class="job-tags">${tags}</div>` : ''}
                <div class="job-card-footer">
                    ${canEdit ? `
                        <button class="btn btn-secondary btn-sm" onclick="openEditJob(${job.id})">수정</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteJob(${job.id})">삭제</button>
                    ` : ''}
                    ${!isCompanyOrAdmin ? `<button class="btn btn-secondary btn-sm" onclick="toggleJobScrap(${job.id}, this)">관심</button>` : ''}
                    <button class="btn btn-primary btn-sm" onclick="applyJob(${job.id})">지원하기</button>
                </div>
            </article>
        `;
    }).join('');
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.querySelector('.btn-search');

    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            const query = searchInput.value.trim();
            filterJobs(query);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const query = this.value.trim();
                filterJobs(query);
            }
        });
        
        // 실시간 검색
        searchInput.addEventListener('input', function() {
            const query = this.value.trim();
            if (query.length >= 2 || query.length === 0) {
                filterJobs(query);
            }
        });
    }
}

function setupFilters() {
    const filterBtn = document.querySelector('.btn-filter');
    const filterSelects = ['filterCompany', 'filterExperience', 'filterLocation', 'typeFilter', 'statusFilter'];
    
    if (filterBtn) {
        filterBtn.addEventListener('click', applyCurrentFilters);
    }
    
    // 필터 변경 시 자동 적용
    filterSelects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.addEventListener('change', applyCurrentFilters);
        }
    });
}

function applyCurrentFilters() {
    filterJobs(document.getElementById('searchInput')?.value.trim() || '');
}

function filterJobs(query) {
    const company = document.getElementById('filterCompany')?.value || '';
    const experience = document.getElementById('filterExperience')?.value || '';
    const location = document.getElementById('filterLocation')?.value || '';
    
    applyFilters(company, experience, location, query);
}

function applyFilters(companyType, experience, location, searchQuery = '') {
    let filtered = allJobs;
    
    // 검색어 필터
    if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(job => 
            (job.company || job.companyName || '').toLowerCase().includes(lowerQuery) ||
            (job.position || job.jobTitle || job.title || '').toLowerCase().includes(lowerQuery) ||
            (job.description || '').toLowerCase().includes(lowerQuery)
        );
    }
    
    // 기업 유형 필터
    if (companyType) {
        filtered = filtered.filter(job => job.companyType === companyType);
    }
    
    // 경력 필터
    if (experience) {
        filtered = filtered.filter(job => job.experience === experience);
    }
    
    // 지역 필터
    if (location) {
        filtered = filtered.filter(job => job.location === location);
    }

    const jobType = document.getElementById('typeFilter')?.value || '';
    if (jobType) {
        filtered = filtered.filter(job => job.jobType === jobType);
    }

    const status = document.getElementById('statusFilter')?.value || '';
    if (status === 'open') {
        filtered = filtered.filter(job => job.status !== 'closed');
    } else if (status === 'closed') {
        filtered = filtered.filter(job => job.status === 'closed');
    }
    
    filteredJobs = filtered;
    displayJobs(filteredJobs);
    
    // 결과 메시지
    const resultCount = filtered.length;
    console.log(`검색 결과: ${resultCount}건`);
}

function viewJobDetail(jobId) {
    const job = allJobs.find(j => j.id === jobId);
    if (!job) return;

    const daysLeft = job.deadline
        ? Math.ceil((new Date(job.deadline) - new Date()) / (1000 * 60 * 60 * 24))
        : null;
    const deadlineText = daysLeft === null ? '상시채용'
        : daysLeft > 0 ? `${job.deadline} (D-${daysLeft})`
        : daysLeft === 0 ? `${job.deadline} (D-Day)` : `${job.deadline} (마감)`;
    const deadlineClass = daysLeft !== null && daysLeft <= 7 ? ' is-urgent' : '';
    const facts = [
        ['고용 형태', JOB_TYPE_LABELS[job.jobType] || job.jobType],
        ['경력', EXPERIENCE_LABELS[job.experience] || job.experience],
        ['근무지', job.location],
        ['급여', job.salary],
        ['채용 인원', job.recruitCount ? `${job.recruitCount}명` : ''],
    ];

    if (document.getElementById('jdCompanyType')) document.getElementById('jdCompanyType').textContent = job.companyType || '';
    if (document.getElementById('jdCompany'))     document.getElementById('jdCompany').textContent     = job.company || '';
    if (document.getElementById('jdPosition'))    document.getElementById('jdPosition').textContent    = job.position || '';

    if (document.getElementById('jdContent')) document.getElementById('jdContent').innerHTML = `
        <dl class="job-detail-facts">
            ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escHtmlJ(v || '-')}</dd></div>`).join('')}
            <div><dt>지원 마감</dt><dd class="job-detail-deadline${deadlineClass}">${escHtmlJ(deadlineText)}</dd></div>
        </dl>
        ${job.description ? `<section class="job-detail-section"><h3>주요 업무</h3><p>${escHtmlJ(job.description)}</p></section>` : ''}
        ${job.requirements ? `<section class="job-detail-section"><h3>자격 요건</h3><p>${escHtmlJ(job.requirements)}</p></section>` : ''}
        <div class="job-modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeJobDetailModal()">닫기</button>
            <button type="button" class="btn btn-primary" onclick="closeJobDetailModal(); applyJob(${job.id})">지원하기</button>
        </div>
    `;

    const modal = document.getElementById('jobDetailModal');
    if (modal) modal.style.display = 'flex';
}

function closeJobDetailModal() {
    const m = document.getElementById('jobDetailModal');
    if (m) m.style.display = 'none';
}
window.closeJobDetailModal = closeJobDetailModal;

let pendingApplyJobId = null;

function closeApplyResumeModal() {
    pendingApplyJobId = null;
    const modal = document.getElementById('applyResumeModal');
    if (modal) modal.style.display = 'none';
}
window.closeApplyResumeModal = closeApplyResumeModal;

async function applyJob(jobId) {
    if (!auth.isLoggedIn()) {
        alert('로그인이 필요한 서비스입니다.');
        window.location.href = 'login.html';
        return;
    }

    const job = allJobs.find(j => j.id === jobId);
    if (!job) return;

    try {
        const data = await api.resumes.list();
        const list = data.resumes || [];
        if (!list.length) {
            if (confirm('등록된 이력서가 없습니다. 경력 관리에서 이력서를 작성할까요?')) {
                window.location.href = 'career.html';
            }
            return;
        }

        pendingApplyJobId = jobId;
        const summary = document.getElementById('applyJobSummary');
        if (summary) {
            summary.textContent = `${job.company || job.company_name || ''} · ${job.position || job.title || ''}`;
        }
        const select = document.getElementById('applyResumeSelect');
        if (select) {
            const primary = list.find(r => r.is_primary) || list[0];
            select.innerHTML = list.map((r) => {
                const mark = r.is_primary ? ' (대표)' : '';
                const selected = String(r.id) === String(primary.id) ? ' selected' : '';
                return `<option value="${r.id}"${selected}>${escHtmlJ(r.title || '이력서')}${mark}</option>`;
            }).join('');
        }
        const modal = document.getElementById('applyResumeModal');
        if (modal) modal.style.display = 'flex';

        const submitBtn = document.getElementById('applyResumeSubmitBtn');
        if (submitBtn) {
            submitBtn.onclick = submitSelectedResumeApplication;
        }
    } catch (e) {
        alert('이력서를 불러오지 못했습니다: ' + (e.message || ''));
    }
}

async function toggleJobScrap(jobId, btn) {
    if (!auth.isLoggedIn()) {
        alert('로그인이 필요한 서비스입니다.');
        window.location.href = 'login.html';
        return;
    }
    try {
        const label = (btn && btn.textContent) || '';
        if (label.includes('해제') || label.includes('관심됨')) {
            await api.jobsApi.unscrap(jobId);
            if (btn) btn.textContent = '관심';
        } else {
            await api.jobsApi.scrap(jobId);
            if (btn) btn.textContent = '관심 해제';
        }
    } catch (e) {
        alert(e.message || '관심 공고 처리에 실패했습니다.');
    }
}

async function submitSelectedResumeApplication() {
    if (!pendingApplyJobId) return;
    const select = document.getElementById('applyResumeSelect');
    const resumeId = select && select.value ? Number(select.value) : null;
    if (!resumeId) {
        alert('첨부할 이력서를 선택하세요.');
        return;
    }
    try {
        await api.post(`/jobs/${pendingApplyJobId}/apply`, { resume_id: resumeId });
        closeApplyResumeModal();
        alert('지원이 완료되었습니다!');
        await loadJobs();
    } catch (e) {
        if (e.message && e.message.includes('Already applied')) {
            alert('이미 지원한 공고입니다.');
        } else {
            alert('지원 실패: ' + e.message);
        }
    }
}

function setupJobApplications() {
    // applyJob 함수가 직접 처리
}

function setupJobCreateForm() {
    const form = document.getElementById('jobCreateForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!auth.isLoggedIn()) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'login.html';
            return;
        }

        if (form.dataset.approvalBlocked === '1') {
            alert('학교 승인 후 채용 공고를 등록할 수 있습니다.');
            return;
        }

        const payload = {
            title:            document.getElementById('title')?.value        || '',
            description:      document.getElementById('description')?.value  || '',
            requirements:     document.getElementById('requirements')?.value || '',
            job_type:         document.getElementById('type')?.value         || '',
            location:         document.getElementById('location')?.value     || '',
            salary_range:     document.getElementById('salary')?.value       || '',
            experience_level: document.getElementById('experience')?.value   || '',
            headcount:        parseInt(document.getElementById('headcount')?.value) || 1,
            deadline:         document.getElementById('deadline')?.value     || null,
        };

        try {
            await api.post('/jobs', payload);
            alert('채용 공고가 성공적으로 등록되었습니다!');
            window.location.href = 'dashboard.html';
        } catch (e) {
            if (e.code === 'COMPANY_NOT_APPROVED' || /승인/.test(String(e.message || ''))) {
                alert(e.message || '학교 승인 후 채용 공고를 등록할 수 있습니다.');
                return;
            }
            alert('등록 실패: ' + e.message);
        }
    });
}

async function gateCompanyJobCreate(user) {
    const form = document.getElementById('jobCreateForm');
    const gate = document.getElementById('companyApprovalGate');
    if (!form || user.user_type !== 'company') return;

    let status = 'pending';
    let reason = '';
    try {
        const data = await api.users.getCompanyProfile();
        status = data.profile?.approval_status || 'pending';
        reason = data.profile?.rejection_reason || '';
    } catch (err) {
        status = 'pending';
    }

    if (status === 'approved') return;

    form.dataset.approvalBlocked = '1';
    form.querySelectorAll('input, textarea, select, button[type="submit"]').forEach((el) => {
        el.disabled = true;
    });
    if (gate) {
        const rejected = status === 'rejected';
        gate.style.display = 'block';
        gate.innerHTML = rejected
            ? `<div class="status-banner status-banner--rejected" role="status">
                기업 승인이 반려되어 공고를 등록할 수 없습니다.
                ${reason ? `<br>사유: ${String(reason).replace(/</g, '&lt;')}` : ''}
                <br><a href="company-profile.html">기업 프로필</a>에서 내용을 보완한 뒤 학교 관리자에게 문의하세요.
              </div>`
            : `<div class="status-banner status-banner--pending" role="status">
                <strong>승인 대기 중</strong> — 학교 관리자 승인 후에 채용 공고를 등록할 수 있습니다.
                <br><a href="company-profile.html">기업 프로필 관리</a>
              </div>`;
    }
}

async function setupJobEditForm() {
    const form = document.getElementById('jobEditForm');
    if (!form) return;

    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get('id');

    if (jobId) {
        try {
            const data = await api.get('/jobs/' + jobId);
            const job = data.job || data;
            const el = id => document.getElementById(id);
            if (el('jobId'))    el('jobId').value    = job.id;
            if (el('title'))    el('title').value    = job.title || '';
            if (el('description')) el('description').value = job.description || '';
            if (el('requirements')) el('requirements').value = job.requirements || '';
            if (el('type'))     el('type').value     = job.job_type || '';
            if (el('location')) el('location').value = job.location || '';
            if (el('salary'))   el('salary').value   = job.salary_range || '';
            if (el('experience')) el('experience').value = job.experience_level || '';
            if (el('deadline')) el('deadline').value = (job.deadline || '').slice(0, 10);
            if (el('headcount')) el('headcount').value = job.headcount || '';
            if (el('status'))   el('status').value   = job.status || 'active';
        } catch (e) {
            alert('공고 정보를 불러오지 못했습니다: ' + e.message);
        }
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!auth.isLoggedIn()) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'login.html';
            return;
        }

        const id = document.getElementById('jobId')?.value || jobId;
        const el = k => document.getElementById(k);

        const payload = {
            title:            el('title')?.value        || '',
            description:      el('description')?.value  || '',
            requirements:     el('requirements')?.value || '',
            job_type:         el('type')?.value         || '',
            location:         el('location')?.value     || '',
            salary_range:     el('salary')?.value       || '',
            experience_level: el('experience')?.value   || '',
            deadline:         el('deadline')?.value     || null,
            headcount:        parseInt(el('headcount')?.value) || 1,
            status:           el('status')?.value       || 'active',
        };

        try {
            await api.put('/jobs/' + id, payload);
            alert('채용 공고가 성공적으로 수정되었습니다!');
            window.location.href = 'dashboard.html';
        } catch (e) {
            alert('수정 실패: ' + e.message);
        }
    });
}

function openEditJob(jobId) {
    window.location.href = 'job-edit.html?id=' + jobId;
}
window.openEditJob = openEditJob;

async function deleteJob(jobId) {
    if (!confirm('이 채용 공고를 삭제하시겠습니까?')) return;
    try {
        await api.delete('/jobs/' + jobId);
        alert('삭제되었습니다.');
        await loadJobs();
    } catch (e) {
        alert('삭제 실패: ' + e.message);
    }
}
window.deleteJob = deleteJob;
