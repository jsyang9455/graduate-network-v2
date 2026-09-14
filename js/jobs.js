// Jobs page functionality
let allJobs = [];
let filteredJobs = [];

document.addEventListener('DOMContentLoaded', function() {
    // Hide student-only menus for company users
    const user = auth.getCurrentUser();
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

function escHtmlJ(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadJobs() {
    const container = document.querySelector('.jobs-container');
    if (container) container.innerHTML = '<p style="text-align:center;padding:3rem;color:#6b7280;">불러오는 중...</p>';
    try {
        const data = await api.get('/jobs');
        allJobs = (data.jobs || []).map(normalizeJob);
        filteredJobs = [...allJobs];
        displayJobs(filteredJobs);
    } catch (e) {
        console.error('채용 공고 로드 실패:', e);
        if (container) container.innerHTML = '<p style="text-align:center;padding:3rem;color:#ef4444;">채용 공고를 불러오지 못했습니다.</p>';
    }
}

function displayJobs(jobs) {
    const container = document.querySelector('.jobs-container');
    if (!container) return;
    
    if (jobs.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 3rem; color: #6b7280;">검색 결과가 없습니다.</p>';
        return;
    }

    const user = auth.getCurrentUser();
    const isCompanyOrAdmin = user && (user.user_type === 'company' || user.user_type === 'admin' || user.user_type === 'teacher');
    
    container.innerHTML = jobs.map(job => {
        const daysLeft = job.deadline
            ? Math.ceil((new Date(job.deadline) - new Date()) / (1000 * 60 * 60 * 24))
            : null;
        const deadlineText = daysLeft !== null ? `${job.deadline} (D-${daysLeft})` : '상시채용';
        const canEdit = isCompanyOrAdmin && (user.user_type === 'admin' || String(job.company_id) === String(user.id));
        return `
            <div class="job-card" data-job-id="${job.id}">
                <div class="job-card-header">
                    <div class="job-title-section">
                        ${job.companyType ? `<span class="company-badge">${escHtmlJ(job.companyType)}</span>` : ''}
                        <h2>${escHtmlJ(job.company)}</h2>
                        <h3>${escHtmlJ(job.position)}</h3>
                    </div>
                    ${canEdit ? `<div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-secondary btn-sm" onclick="openEditJob(${job.id})">수정</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteJob(${job.id})">삭제</button>
                    </div>` : ''}
                </div>
                <div class="job-card-body">
                    <div class="job-info-grid">
                        <div class="info-item">
                            <span class="info-label">🎯 경력</span>
                            <span class="info-value">${escHtmlJ(job.experience || '-')}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">📍 지역</span>
                            <span class="info-value">${escHtmlJ(job.location || '-')}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">💰 연봉</span>
                            <span class="info-value">${escHtmlJ(job.salary || '-')}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">📅 마감일</span>
                            <span class="info-value">${escHtmlJ(deadlineText)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">👥 채용인원</span>
                            <span class="info-value">${job.recruitCount || '-'}명</span>
                        </div>
                    </div>
                    <p class="job-description">${escHtmlJ(job.description)}</p>
                </div>
                <div class="job-card-footer">
                    <button class="btn btn-secondary" onclick="viewJobDetail(${job.id})">상세보기</button>
                    ${!isCompanyOrAdmin ? `<button class="btn btn-secondary" onclick="toggleJobScrap(${job.id}, this)">관심</button>` : ''}
                    <button class="btn btn-primary" onclick="applyJob(${job.id})">지원하기</button>
                </div>
            </div>
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
    const filterSelects = ['filterCompany', 'filterExperience', 'filterLocation'];
    
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
    const company = document.getElementById('filterCompany').value;
    const experience = document.getElementById('filterExperience').value;
    const location = document.getElementById('filterLocation').value;
    const searchQuery = document.getElementById('searchInput').value.trim();
    
    applyFilters(company, experience, location, searchQuery);
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
    const deadlineText = daysLeft !== null ? `${job.deadline} (D-${daysLeft})` : '상시채용';
    const deadlineColor = daysLeft === null ? '#6b7280' : daysLeft > 7 ? '#166534' : daysLeft > 0 ? '#854d0e' : '#ef4444';

    if (document.getElementById('jdCompanyType')) document.getElementById('jdCompanyType').textContent = job.companyType || '';
    if (document.getElementById('jdCompany'))     document.getElementById('jdCompany').textContent     = job.company || '';
    if (document.getElementById('jdPosition'))    document.getElementById('jdPosition').textContent    = job.position || '';

    if (document.getElementById('jdContent')) document.getElementById('jdContent').innerHTML = `
        ${job.description ? `<p style="color:#374151; font-size:0.95rem; line-height:1.7; margin:0 0 1.5rem; padding:1rem; background:#f8fafc; border-radius:8px; border-left:3px solid #3b82f6;">${escHtmlJ(job.description)}</p>` : ''}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
            <div style="background:#f0f4ff; padding:0.9rem; border-radius:8px;">
                <div style="font-size:0.75rem; color:#6b7280; margin-bottom:0.25rem;">💼 경력</div>
                <div style="font-weight:600; color:#1e3a8a;">${escHtmlJ(job.experience || '-')}</div>
            </div>
            <div style="background:#f0f4ff; padding:0.9rem; border-radius:8px;">
                <div style="font-size:0.75rem; color:#6b7280; margin-bottom:0.25rem;">📍 근무지</div>
                <div style="font-weight:600; color:#1e3a8a;">${escHtmlJ(job.location || '-')}</div>
            </div>
            <div style="background:#fefce8; padding:0.9rem; border-radius:8px;">
                <div style="font-size:0.75rem; color:#6b7280; margin-bottom:0.25rem;">💰 연봉</div>
                <div style="font-weight:600; color:#854d0e;">${escHtmlJ(job.salary || '-')}</div>
            </div>
            <div style="background:#f0fdf4; padding:0.9rem; border-radius:8px;">
                <div style="font-size:0.75rem; color:#6b7280; margin-bottom:0.25rem;">👥 채용인원</div>
                <div style="font-weight:600; color:#166534;">${job.recruitCount || '-'}명</div>
            </div>
            <div style="background:#fff1f2; padding:0.9rem; border-radius:8px; grid-column:1/-1;">
                <div style="font-size:0.75rem; color:#6b7280; margin-bottom:0.25rem;">📅 지원 마감</div>
                <div style="font-weight:600; color:${deadlineColor};">${escHtmlJ(deadlineText)}</div>
            </div>
        </div>
        ${job.requirements ? `<div style="margin-bottom:1.25rem;">
            <strong style="color:#1e40af; display:block; margin-bottom:0.6rem; font-size:0.95rem;">📋 지원 자격</strong>
            <div style="font-size:0.9rem; color:#374151; line-height:1.7; padding:0.75rem; background:#f8fafc; border-radius:8px;">${escHtmlJ(job.requirements)}</div>
        </div>` : ''}
        <div style="display:flex; gap:0.75rem; margin-top:1.5rem;">
            <button onclick="closeJobDetailModal()" style="flex:1; padding:0.875rem; background:#f3f4f6; border:none; border-radius:8px; font-size:1rem; cursor:pointer; color:#374151; font-weight:600;">닫기</button>
            <button onclick="closeJobDetailModal(); applyJob(${job.id})" style="flex:2; padding:0.875rem; background:#1e40af; color:white; border:none; border-radius:8px; font-size:1rem; cursor:pointer; font-weight:600;">지원하기</button>
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
            alert('등록 실패: ' + e.message);
        }
    });
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
