// Company profile (REQ-PLT-001 / B-LS — API only, JWT)
document.addEventListener('DOMContentLoaded', async function() {
    if (!auth.requireAuth()) return;

    const user = auth.getCurrentUser();
    const nameEl = document.getElementById('userName');
    if (nameEl && user) nameEl.textContent = user.name || '';

    if (!user || user.user_type !== 'company') {
        if (!auth.isStaffAdmin(user)) {
            alert('기업 회원만 이용할 수 있습니다.');
            window.location.href = 'dashboard.html';
            return;
        }
    }

    hideNonCompanyMenus();
    await loadCompanyProfile();

    const form = document.getElementById('companyProfileForm');
    if (form) {
        form.addEventListener('submit', saveCompanyProfile);
    }
});

function hideNonCompanyMenus() {
    ['counselingMenu', 'careerMenu', 'journalMenu'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

async function loadCompanyProfile() {
    const content = document.getElementById('companyProfileContent');
    if (!content) return;

    content.innerHTML = '<p style="color:#6b7280;">불러오는 중...</p>';

    let profile = null;
    try {
        const data = await api.users.getCompanyProfile();
        profile = data.profile || null;
    } catch (err) {
        // 404 = empty form
        if (!(err.message && /not found|404/i.test(err.message))) {
            console.warn('company profile load:', err.message);
        }
    }

    const user = auth.getCurrentUser() || {};
    content.innerHTML = `
        <form id="companyProfileForm" class="auth-form" style="max-width:640px;">
            <div class="form-group">
                <label for="company_name">기업명 *</label>
                <input type="text" id="company_name" required value="${esc(profile?.company_name || user.name || '')}">
            </div>
            <div class="form-group">
                <label for="industry">업종</label>
                <input type="text" id="industry" value="${esc(profile?.industry || '')}" placeholder="예: 제조/기계">
            </div>
            <div class="form-group">
                <label for="company_size">기업 규모</label>
                <select id="company_size">
                    <option value="">선택</option>
                    <option value="startup">스타트업</option>
                    <option value="sme">중소기업</option>
                    <option value="mid">중견기업</option>
                    <option value="large">대기업</option>
                </select>
            </div>
            <div class="form-group">
                <label for="website">웹사이트</label>
                <input type="url" id="website" value="${esc(profile?.website || '')}" placeholder="https://">
            </div>
            <div class="form-group">
                <label for="address">소재지</label>
                <input type="text" id="address" value="${esc(profile?.address || '')}">
            </div>
            <div class="form-group">
                <label for="founded_year">설립연도</label>
                <input type="number" id="founded_year" min="1900" max="2100" value="${esc(profile?.founded_year != null ? String(profile.founded_year) : '')}">
            </div>
            <div class="form-group">
                <label for="description">기업 소개</label>
                <textarea id="description" rows="5">${esc(profile?.description || '')}</textarea>
            </div>
            <div id="companyProfileMsg" class="success-message" style="display:none;"></div>
            <div class="form-actions" style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <button type="submit" class="btn btn-primary">저장</button>
                <a href="job-create.html" class="btn btn-secondary">채용 공고 등록</a>
                <a href="dashboard.html" class="btn btn-secondary">대시보드</a>
            </div>
        </form>
    `;

    const sizeEl = document.getElementById('company_size');
    if (sizeEl && profile?.company_size) {
        sizeEl.value = profile.company_size;
    }

    document.getElementById('companyProfileForm').addEventListener('submit', saveCompanyProfile);
}

async function saveCompanyProfile(e) {
    e.preventDefault();
    const msg = document.getElementById('companyProfileMsg');
    const payload = {
        company_name: document.getElementById('company_name').value.trim(),
        industry: document.getElementById('industry').value.trim() || null,
        company_size: document.getElementById('company_size').value || null,
        website: document.getElementById('website').value.trim() || null,
        address: document.getElementById('address').value.trim() || null,
        description: document.getElementById('description').value.trim() || null,
        founded_year: document.getElementById('founded_year').value
            ? parseInt(document.getElementById('founded_year').value, 10)
            : null,
    };

    if (!payload.company_name) {
        alert('기업명을 입력해주세요.');
        return;
    }

    try {
        await api.users.updateCompanyProfile(payload);
        if (msg) {
            msg.textContent = '기업 프로필이 저장되었습니다.';
            msg.style.display = 'block';
        } else {
            alert('저장되었습니다.');
        }
    } catch (err) {
        alert('저장 실패: ' + (err.message || ''));
    }
}

function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
