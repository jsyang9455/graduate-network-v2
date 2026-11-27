// Company profile (REQ-PLT-001 / B-LS — API only, JWT)
// REQ-JOB-007: show approval banner; gate job-create CTA
document.addEventListener('DOMContentLoaded', async function() {
    if (!auth.requireAuth()) return;

    // 메뉴 표시는 auth.applyPermissionMenus만 사용 (페이지별 숨김 로직 금지 — 일관성)
    const user = await auth.whenUserLoaded();
    const nameEl = document.getElementById('userName');
    if (nameEl && user) nameEl.textContent = user.name || '';

    if (!user || user.user_type !== 'company') {
        if (!auth.isStaffAdmin(user)) {
            alert('기업 회원만 이용할 수 있습니다.');
            window.location.href = 'dashboard.html';
            return;
        }
    }

    await loadCompanyProfile();
}

function approvalBannerHtml(status, rejectionReason) {
    if (status === 'approved') {
        return `<div class="status-banner status-banner--approved" role="status">
            기업이 <strong>승인</strong>되었습니다. 채용 공고를 등록할 수 있습니다.
        </div>`;
    }
    if (status === 'rejected') {
        const reason = rejectionReason
            ? `<br><span class="status-banner__detail">사유: ${esc(rejectionReason)}</span>`
            : '';
        return `<div class="status-banner status-banner--rejected" id="companyApprovalBanner" role="status">
            기업 승인이 <strong>반려</strong>되었습니다. 프로필을 보완한 뒤 관리자에게 재심사를 요청하세요.${reason}
        </div>`;
    }
    return `<div class="status-banner status-banner--pending" id="companyApprovalBanner" role="status">
        <strong>승인 대기 중</strong>입니다. 로그인과 기업 프로필 수정은 가능하지만, 관리자 승인 전에는 채용 공고를 등록할 수 없습니다.
    </div>`;
}

async function loadCompanyProfile() {
    const content = document.getElementById('companyProfileContent');
    if (!content) return;

    content.innerHTML = '<p class="page-note">불러오는 중...</p>';

    let profile = null;
    try {
        const data = await api.users.getCompanyProfile();
        profile = data.profile || null;
    } catch (err) {
        if (!(err.message && /not found|404/i.test(err.message))) {
            console.warn('company profile load:', err.message);
        }
    }

    const user = auth.getCurrentUser() || {};
    const status = profile?.approval_status || 'pending';
    const canPostJobs = status === 'approved';
    const jobCta = canPostJobs
        ? '<a href="job-create.html" class="btn btn-secondary">채용 공고 등록</a>'
        : '<button type="button" class="btn btn-secondary" disabled title="관리자 승인 후 이용 가능">채용 공고 등록 (승인 대기)</button>';

    content.innerHTML = `
        ${approvalBannerHtml(status, profile?.rejection_reason)}
        <form id="companyProfileForm" class="auth-form">
            <div class="form-group">
                <label for="company_name">기업명 *</label>
                <input type="text" id="company_name" required value="${esc(profile?.company_name || user.name || '')}">
            </div>
            <div class="form-group">
                <label for="industry">업종</label>
                <input type="text" id="industry" value="${esc(profile?.industry || '')}" placeholder="예: 제조/기계">
            </div>
            <div class="form-group">
                <label for="company_size">직원 수</label>
                <select id="company_size">
                    <option value="">선택</option>
                    <option value="1-10">1~10명</option>
                    <option value="11-50">11~50명</option>
                    <option value="51-200">51~200명</option>
                    <option value="201-500">201~500명</option>
                    <option value="500+">500명 이상</option>
                    <optgroup label="기존 규모 구분">
                        <option value="startup">스타트업</option>
                        <option value="sme">중소기업</option>
                        <option value="mid">중견기업</option>
                        <option value="large">대기업</option>
                    </optgroup>
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
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">저장</button>
                ${jobCta}
                <a href="dashboard.html" class="btn btn-secondary">대시보드</a>
            </div>
        </form>
    `;

    const sizeEl = document.getElementById('company_size');
    if (sizeEl && profile?.company_size) {
        if (![...sizeEl.options].some((o) => o.value === profile.company_size)) {
            sizeEl.add(new Option(profile.company_size, profile.company_size));
        }
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
