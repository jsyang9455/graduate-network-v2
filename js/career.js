// career.html — resume API (REQ-RSM-001~005, REQ-PLT-001). JWT only in localStorage.

let resumeList = [];
let currentResume = null;
let persistTimer = null;

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function itemsOf(section) {
    if (!currentResume || !Array.isArray(currentResume.items)) return [];
    return currentResume.items.filter((i) => i.section === section);
}

function payload(item) {
    return item.payload || {};
}

document.addEventListener('DOMContentLoaded', async function () {
    if (!auth.isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }
    const user = auth.getCurrentUser();
    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = user.name;
    setupFormSubmissions();
    await bootResumes();
});

function setupFormSubmissions() {
    const map = [
        ['addCareerForm', saveCareer],
        ['addCertificateForm', saveCertificate],
        ['addEducationForm', saveEducation],
        ['addPortfolioForm', savePortfolio],
        ['addAwardForm', saveAward],
        ['addLanguageForm', saveLanguage],
        ['basicInfoForm', saveBasicInfo],
    ];
    map.forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('submit', function (e) {
            e.preventDefault();
            fn();
        });
    });
}

async function bootResumes() {
    try {
        const data = await api.resumes.list();
        resumeList = data.resumes || [];
        if (!resumeList.length) {
            const created = await api.resumes.create({
                title: '기본 이력서',
                status: 'draft',
                template_code: 'basic',
            });
            currentResume = created.resume;
            resumeList = [currentResume];
        } else {
            const pick = resumeList.find((r) => r.is_primary) || resumeList[0];
            await selectResume(pick.id);
            return;
        }
        renderResumeChrome();
        renderAllSections();
    } catch (err) {
        console.error(err);
        alert('이력서를 불러오지 못했습니다: ' + err.message);
    }
}

async function selectResume(id) {
    const data = await api.resumes.get(id);
    currentResume = data.resume;
    renderResumeChrome();
    renderAllSections();
}

function renderResumeChrome() {
    const select = document.getElementById('resumeSelect');
    if (select) {
        select.innerHTML = resumeList.map((r) => `
            <option value="${r.id}" ${currentResume && String(r.id) === String(currentResume.id) ? 'selected' : ''}>
                ${esc(r.title || '이력서')}${r.is_primary ? ' (대표)' : ''}
            </option>`).join('');
    }
    const title = document.getElementById('resumeTitle');
    if (title && currentResume) title.value = currentResume.title || '';
    const tmpl = document.getElementById('resumeTemplate');
    if (tmpl && currentResume) tmpl.value = currentResume.template_code || 'basic';
    const primaryBtn = document.getElementById('primaryBadge');
    if (primaryBtn && currentResume) {
        primaryBtn.style.display = currentResume.is_primary ? 'inline-block' : 'none';
    }
    fillBasicInfoForm();
    const summary = document.getElementById('resumeSummary');
    if (summary && currentResume) summary.value = currentResume.summary || '';
}

function fillBasicInfoForm() {
    const info = (currentResume && currentResume.basic_info) || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('basicName', info.name);
    set('basicEmail', info.email);
    set('basicPhone', info.phone);
    set('basicSchool', info.school_name);
    set('basicMajor', info.major);
}

function collectItems() {
    return (currentResume.items || []).map((item, idx) => ({
        section: item.section,
        payload: item.payload || {},
        sort_order: item.sort_order ?? idx,
    }));
}

async function persist(extra = {}) {
    if (!currentResume) return;
    const payloadBody = {
        title: document.getElementById('resumeTitle')?.value?.trim() || currentResume.title,
        template_code: document.getElementById('resumeTemplate')?.value || currentResume.template_code,
        summary: document.getElementById('resumeSummary')?.value ?? currentResume.summary,
        basic_info: {
            name: document.getElementById('basicName')?.value || '',
            email: document.getElementById('basicEmail')?.value || '',
            phone: document.getElementById('basicPhone')?.value || '',
            school_name: document.getElementById('basicSchool')?.value || '',
            major: document.getElementById('basicMajor')?.value || '',
        },
        items: collectItems(),
        status: currentResume.status || 'draft',
        ...extra,
    };
    const data = await api.resumes.update(currentResume.id, payloadBody);
    currentResume = data.resume;
    const idx = resumeList.findIndex((r) => String(r.id) === String(currentResume.id));
    if (idx >= 0) resumeList[idx] = { ...resumeList[idx], ...currentResume };
    renderResumeChrome();
    renderAllSections();
}

function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persist().catch((err) => alert('저장 실패: ' + err.message));
    }, 400);
}

async function saveBasicInfo() {
    try {
        await persist();
        alert('기본정보가 저장되었습니다.');
    } catch (err) {
        alert('저장 실패: ' + err.message);
    }
}

async function onResumeSelectChange() {
    const id = document.getElementById('resumeSelect').value;
    try {
        await selectResume(id);
    } catch (err) {
        alert(err.message);
    }
}

async function createNewResume() {
    const title = prompt('새 이력서 제목', '이력서 ' + (resumeList.length + 1));
    if (!title) return;
    try {
        const data = await api.resumes.create({ title: title.trim(), template_code: 'basic' });
        resumeList.unshift(data.resume);
        currentResume = data.resume;
        renderResumeChrome();
        renderAllSections();
    } catch (err) {
        alert('생성 실패: ' + err.message);
    }
}

async function setPrimaryResume() {
    if (!currentResume) return;
    try {
        await persist();
        const data = await api.resumes.setPrimary(currentResume.id);
        currentResume = data.resume;
        resumeList = resumeList.map((r) => ({ ...r, is_primary: String(r.id) === String(currentResume.id) }));
        renderResumeChrome();
        alert('대표 이력서로 지정했습니다.');
    } catch (err) {
        alert(err.message);
    }
}

async function deleteCurrentResume() {
    if (!currentResume) return;
    if (resumeList.length <= 1) {
        alert('최소 1개의 이력서가 필요합니다.');
        return;
    }
    if (!confirm('이 이력서를 삭제할까요?')) return;
    try {
        await api.resumes.remove(currentResume.id);
        resumeList = resumeList.filter((r) => String(r.id) !== String(currentResume.id));
        await selectResume(resumeList[0].id);
    } catch (err) {
        alert(err.message);
    }
}

async function downloadResumePdf() {
    if (!currentResume) return;
    try {
        await persist();
        const template = document.getElementById('resumeTemplate')?.value;
        await api.resumes.pdf(currentResume.id, template);
    } catch (err) {
        alert('PDF 생성 실패: ' + err.message);
    }
}

async function previewResume() {
    if (!currentResume) return;
    try {
        await persist();
        const data = await api.resumes.preview(currentResume.id);
        const body = document.getElementById('resumePreviewBody');
        if (body) body.innerHTML = data.html || '';
        document.getElementById('resumePreviewModal').style.display = 'block';
    } catch (err) {
        alert('미리보기 실패: ' + err.message);
    }
}

function closePreviewModal() {
    const m = document.getElementById('resumePreviewModal');
    if (m) m.style.display = 'none';
}

function addItem(section, payloadObj) {
    if (!currentResume.items) currentResume.items = [];
    currentResume.items.push({
        section,
        payload: payloadObj,
        sort_order: currentResume.items.length,
    });
}

function removeItemByIndex(section, indexInSection) {
    let seen = -1;
    currentResume.items = (currentResume.items || []).filter((item) => {
        if (item.section !== section) return true;
        seen += 1;
        return seen !== Number(indexInSection);
    });
}

async function saveCareer() {
    addItem('experience', {
        company: document.getElementById('careerCompany').value,
        position: document.getElementById('careerPosition').value,
        startDate: document.getElementById('careerStartDate').value,
        endDate: document.getElementById('careerCurrent').checked ? '현재' : document.getElementById('careerEndDate').value,
        current: document.getElementById('careerCurrent').checked,
        description: document.getElementById('careerDescription').value,
    });
    try {
        await persist();
        closeAddCareerModal();
        document.getElementById('addCareerForm').reset();
        alert('경력이 추가되었습니다.');
    } catch (err) {
        alert(err.message);
    }
}

function loadCareerData() {
    const container = document.getElementById('careerTimeline');
    if (!container) return;
    const list = itemsOf('experience');
    if (!list.length) {
        container.innerHTML = '<p style="color: #6b7280;">등록된 경력이 없습니다.</p>';
        return;
    }
    container.innerHTML = list.map((item, idx) => {
        const c = payload(item);
        return `
            <div class="career-card">
                <div class="career-header">
                    <h3>${esc(c.company)}</h3>
                    <button class="btn-icon" onclick="deleteCareer(${idx})">🗑️</button>
                </div>
                <p class="career-position">${esc(c.position)}</p>
                <p class="career-period">${esc(c.startDate)} - ${esc(c.current ? '현재' : c.endDate)}</p>
                ${c.description ? `<p class="career-description">${esc(c.description)}</p>` : ''}
            </div>`;
    }).join('');
}

async function deleteCareer(idx) {
    if (!confirm('이 경력을 삭제하시겠습니까?')) return;
    removeItemByIndex('experience', idx);
    try { await persist(); } catch (err) { alert(err.message); }
}

async function saveCertificate() {
    addItem('certificate', {
        name: document.getElementById('certificateName').value,
        issuer: document.getElementById('certificateIssuer').value,
        date: document.getElementById('certificateDate').value,
    });
    try {
        await persist();
        closeAddCertificateModal();
        document.getElementById('addCertificateForm').reset();
        alert('자격증이 추가되었습니다.');
    } catch (err) { alert(err.message); }
}

function loadCertificates() {
    const container = document.getElementById('certificateList');
    if (!container) return;
    const list = itemsOf('certificate');
    if (!list.length) {
        container.innerHTML = '<p style="color: #6b7280;">등록된 자격증이 없습니다.</p>';
        return;
    }
    container.innerHTML = list.map((item, idx) => {
        const c = payload(item);
        return `<div class="certificate-item">
            <div><strong>${esc(c.name)}</strong><p>${esc(c.issuer)} · ${esc(c.date)}</p></div>
            <button class="btn-icon" onclick="deleteCertificate(${idx})">🗑️</button>
        </div>`;
    }).join('');
}

async function deleteCertificate(idx) {
    if (!confirm('이 자격증을 삭제하시겠습니까?')) return;
    removeItemByIndex('certificate', idx);
    try { await persist(); } catch (err) { alert(err.message); }
}

async function saveEducation() {
    addItem('education', {
        name: document.getElementById('educationName').value,
        institution: document.getElementById('educationInstitution').value,
        startDate: document.getElementById('educationStartDate').value,
        endDate: document.getElementById('educationEndDate').value,
        description: document.getElementById('educationDescription').value,
    });
    try {
        await persist();
        closeAddEducationModal();
        document.getElementById('addEducationForm').reset();
        alert('학력/교육이 추가되었습니다.');
    } catch (err) { alert(err.message); }
}

function loadEducation() {
    const container = document.getElementById('educationList');
    if (!container) return;
    const list = itemsOf('education');
    if (!list.length) {
        container.innerHTML = '<p style="color: #6b7280;">등록된 학력이 없습니다.</p>';
        return;
    }
    container.innerHTML = list.map((item, idx) => {
        const e = payload(item);
        return `<div class="education-card">
            <div class="education-header">
                <h3>${esc(e.name)}</h3>
                <button class="btn-icon" onclick="deleteEducation(${idx})">🗑️</button>
            </div>
            <p class="education-institution">${esc(e.institution)}</p>
            <p class="education-period">${esc(e.startDate)} - ${esc(e.endDate)}</p>
            ${e.description ? `<p class="education-description">${esc(e.description)}</p>` : ''}
        </div>`;
    }).join('');
}

async function deleteEducation(idx) {
    if (!confirm('이 학력을 삭제하시겠습니까?')) return;
    removeItemByIndex('education', idx);
    try { await persist(); } catch (err) { alert(err.message); }
}

async function savePortfolio() {
    addItem('portfolio', {
        title: document.getElementById('portfolioTitle').value,
        description: document.getElementById('portfolioDescription').value,
        tech: document.getElementById('portfolioTech').value,
        link: document.getElementById('portfolioLink').value,
    });
    try {
        await persist();
        closeAddPortfolioModal();
        document.getElementById('addPortfolioForm').reset();
        alert('포트폴리오가 추가되었습니다.');
    } catch (err) { alert(err.message); }
}

function loadPortfolio() {
    const container = document.getElementById('portfolioGrid');
    if (!container) return;
    const list = itemsOf('portfolio');
    if (!list.length) {
        container.innerHTML = '<p style="color: #6b7280;">등록된 포트폴리오가 없습니다.</p>';
        return;
    }
    container.innerHTML = list.map((item, idx) => {
        const p = payload(item);
        return `<div class="portfolio-card">
            <div class="portfolio-header">
                <h3>${esc(p.title)}</h3>
                <button class="btn-icon" onclick="deletePortfolio(${idx})">🗑️</button>
            </div>
            <p class="portfolio-description">${esc(p.description)}</p>
            ${p.tech ? `<p class="portfolio-tech">🛠️ ${esc(p.tech)}</p>` : ''}
            ${p.link ? `<a href="${esc(p.link)}" target="_blank" class="portfolio-link">프로젝트 보기 →</a>` : ''}
        </div>`;
    }).join('');
}

async function deletePortfolio(idx) {
    if (!confirm('이 포트폴리오를 삭제하시겠습니까?')) return;
    removeItemByIndex('portfolio', idx);
    try { await persist(); } catch (err) { alert(err.message); }
}

async function addSkill() {
    const input = document.getElementById('skillInput');
    const skill = input.value.trim();
    if (!skill) return;
    addItem('skill', { name: skill });
    input.value = '';
    try { await persist(); } catch (err) { alert(err.message); }
}

function loadSkills() {
    const container = document.getElementById('skillList');
    if (!container) return;
    const list = itemsOf('skill');
    container.innerHTML = list.map((item, idx) => {
        const s = payload(item);
        return `<span class="tag">${esc(s.name)} <button onclick="deleteSkill(${idx})">×</button></span>`;
    }).join('');
}

async function deleteSkill(idx) {
    removeItemByIndex('skill', idx);
    try { await persist(); } catch (err) { alert(err.message); }
}

async function saveAward() {
    addItem('award', {
        name: document.getElementById('awardName').value,
        issuer: document.getElementById('awardIssuer').value,
        date: document.getElementById('awardDate').value,
        description: document.getElementById('awardDescription').value,
    });
    try {
        await persist();
        closeAddAwardModal();
        document.getElementById('addAwardForm').reset();
        alert('수상 내역이 추가되었습니다.');
    } catch (err) { alert(err.message); }
}

function loadAwards() {
    const container = document.getElementById('awardList');
    if (!container) return;
    const list = itemsOf('award');
    if (!list.length) {
        container.innerHTML = '<p style="color: #6b7280;">등록된 수상 내역이 없습니다.</p>';
        return;
    }
    container.innerHTML = list.map((item, idx) => {
        const a = payload(item);
        return `<div class="certificate-item">
            <div><strong>${esc(a.name)}</strong><p>${esc(a.issuer)} · ${esc(a.date)}</p></div>
            <button class="btn-icon" onclick="deleteAward(${idx})">🗑️</button>
        </div>`;
    }).join('');
}

async function deleteAward(idx) {
    if (!confirm('이 수상 내역을 삭제하시겠습니까?')) return;
    removeItemByIndex('award', idx);
    try { await persist(); } catch (err) { alert(err.message); }
}

async function saveLanguage() {
    addItem('language', {
        name: document.getElementById('languageName').value,
        level: document.getElementById('languageLevel').value,
    });
    try {
        await persist();
        closeAddLanguageModal();
        document.getElementById('addLanguageForm').reset();
        alert('어학 정보가 추가되었습니다.');
    } catch (err) { alert(err.message); }
}

function loadLanguages() {
    const container = document.getElementById('languageList');
    if (!container) return;
    const list = itemsOf('language');
    if (!list.length) {
        container.innerHTML = '<p style="color: #6b7280;">등록된 어학 정보가 없습니다.</p>';
        return;
    }
    container.innerHTML = list.map((item, idx) => {
        const l = payload(item);
        return `<span class="tag">${esc(l.name)} (${esc(l.level)}) <button onclick="deleteLanguage(${idx})">×</button></span>`;
    }).join('');
}

async function deleteLanguage(idx) {
    removeItemByIndex('language', idx);
    try { await persist(); } catch (err) { alert(err.message); }
}

function renderAllSections() {
    loadCareerData();
    loadCertificates();
    loadEducation();
    loadPortfolio();
    loadSkills();
    loadAwards();
    loadLanguages();
}

function openAddCareerModal() { document.getElementById('addCareerModal').style.display = 'block'; }
function closeAddCareerModal() { document.getElementById('addCareerModal').style.display = 'none'; }
function openAddCertificateModal() { document.getElementById('addCertificateModal').style.display = 'block'; }
function closeAddCertificateModal() { document.getElementById('addCertificateModal').style.display = 'none'; }
function openAddEducationModal() { document.getElementById('addEducationModal').style.display = 'block'; }
function closeAddEducationModal() { document.getElementById('addEducationModal').style.display = 'none'; }
function openAddPortfolioModal() { document.getElementById('addPortfolioModal').style.display = 'block'; }
function closeAddPortfolioModal() { document.getElementById('addPortfolioModal').style.display = 'none'; }
function openAddAwardModal() { document.getElementById('addAwardModal').style.display = 'block'; }
function closeAddAwardModal() { document.getElementById('addAwardModal').style.display = 'none'; }
function openAddLanguageModal() { document.getElementById('addLanguageModal').style.display = 'block'; }
function closeAddLanguageModal() { document.getElementById('addLanguageModal').style.display = 'none'; }
function toggleEndDate() {
    const checkbox = document.getElementById('careerCurrent');
    const endDateInput = document.getElementById('careerEndDate');
    endDateInput.disabled = checkbox.checked;
    if (checkbox.checked) endDateInput.value = '';
}
