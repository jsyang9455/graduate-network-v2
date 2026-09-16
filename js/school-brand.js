/**
 * School-scoped branding for header / dashboard (REQ-IAM-009, REQ-PLT-004).
 * Prefer user.school from GET /api/auth/me; fall back to GET /api/schools/:id.
 * JWT only in localStorage — school payload may be cached on the user object after /me.
 */
(function (global) {
  const DEFAULT_LOGO = 'images/logo.svg';

  function apiOrigin() {
    try {
      if (global.API_BASE_URL) {
        return String(global.API_BASE_URL).replace(/\/api\/?$/, '');
      }
      if (global.api && global.api.baseURL) {
        return String(global.api.baseURL).replace(/\/api\/?$/, '');
      }
      if (global.api && typeof global.api.getBaseUrl === 'function') {
        return String(global.api.getBaseUrl()).replace(/\/api\/?$/, '');
      }
    } catch (_) { /* ignore */ }
    try {
      const stored = localStorage.getItem('jjobb_api_base');
      if (stored) return String(stored).replace(/\/api\/?$/, '');
    } catch (_) { /* ignore */ }
    const host = global.location && global.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    return '';
  }

  function resolveLogoUrl(school) {
    if (!school) return null;
    if (school.logo_url) {
      if (school.logo_url.startsWith('http')) return school.logo_url;
      const origin = apiOrigin();
      return origin ? `${origin}${school.logo_url}` : school.logo_url;
    }
    if (school.logo_file_id && school.id) {
      const origin = apiOrigin();
      const path = `/api/schools/${school.id}/logo`;
      return origin ? `${origin}${path}` : path;
    }
    return null;
  }

  function applyFromUser(user) {
    if (!user) return;
    const school = user.school || null;
    const name = (school && school.name) || user.school_name || null;
    const logoUrl = resolveLogoUrl(school);

    const logoImg = document.getElementById('brandLogo')
      || document.querySelector('header .logo img, header .logo-img, .logo .logo-img');
    if (logoImg) {
      if (logoUrl) {
        logoImg.src = logoUrl;
        logoImg.alt = name ? `${name} 로고` : logoImg.alt;
        logoImg.classList.add('school-branded');
      }
    }

    document.querySelectorAll('[data-school-brand="logo"]').forEach((img) => {
      if (logoUrl) {
        img.src = logoUrl;
        img.alt = name ? `${name} 로고` : img.alt;
        img.hidden = false;
      }
    });

    const contextEls = [
      document.getElementById('schoolContextLabel'),
      document.getElementById('schoolBrandName'),
      ...document.querySelectorAll('[data-school-brand="name"]'),
    ].filter(Boolean);
    contextEls.forEach((el) => {
      if (name) {
        el.textContent = name;
        el.hidden = false;
        el.style.display = '';
      }
    });

    const welcomeSub = document.getElementById('welcomeSubtext');
    if (welcomeSub && name) {
      const hour = new Date().getHours();
      let greeting = '좋은 하루 되세요';
      if (hour < 12) greeting = '좋은 아침입니다';
      else if (hour < 18) greeting = '좋은 오후입니다';
      else greeting = '좋은 저녁입니다';
      welcomeSub.textContent = `${name} · ${greeting}`;
    }

    const welcomeSchool = document.getElementById('welcomeSchoolName');
    if (welcomeSchool && name) {
      welcomeSchool.textContent = name;
      welcomeSchool.hidden = false;
    }

    const welcomeLogo = document.getElementById('welcomeSchoolLogo');
    if (welcomeLogo) {
      if (logoUrl) {
        welcomeLogo.src = logoUrl;
        welcomeLogo.hidden = false;
      } else {
        welcomeLogo.hidden = true;
      }
    }

    if (name && document.title && !document.title.includes(name)) {
      const base = document.title.split(' - ').pop() || document.title;
      document.title = `${name} - ${base}`;
    }

    document.documentElement.classList.toggle('has-school-brand', Boolean(name));
    if (name) document.documentElement.setAttribute('data-school-name', name);
    else document.documentElement.removeAttribute('data-school-name');
  }

  async function apply(user) {
    const u = user || (global.auth && global.auth.getCurrentUser && global.auth.getCurrentUser());
    if (!u) return null;
    if (u.school && u.school.name) {
      applyFromUser(u);
      return u.school;
    }
    if (u.school_id && global.api && global.api.schools) {
      try {
        const res = await global.api.schools.get(u.school_id);
        const school = res.school;
        const merged = { ...u, school, school_name: school?.name || u.school_name };
        try {
          localStorage.setItem(global.auth?.storageKey || 'graduateNetwork_user', JSON.stringify(merged));
        } catch (_) { /* ignore */ }
        applyFromUser(merged);
        return school;
      } catch (err) {
        console.warn('SchoolBrand apply fetch failed', err);
        applyFromUser(u);
        return null;
      }
    }
    applyFromUser(u);
    return null;
  }

  async function refresh() {
    if (!global.auth || !global.auth.isLoggedIn()) return null;
    try {
      const response = await global.api.auth.getCurrentUser();
      if (response.user) {
        localStorage.setItem(global.auth.storageKey, JSON.stringify(response.user));
        applyFromUser(response.user);
        return response.user;
      }
    } catch (err) {
      console.warn('SchoolBrand refresh failed', err);
    }
    return null;
  }

  global.SchoolBrand = {
    apply,
    applyFromUser,
    refresh,
    resolveLogoUrl,
    DEFAULT_LOGO,
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (global.auth && global.auth.isLoggedIn()) {
      const user = global.auth.getCurrentUser();
      if (user && (user.school || user.school_id || user.school_name)) {
        apply(user);
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
