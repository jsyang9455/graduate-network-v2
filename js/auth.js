// Authentication Management
// REQ-PLT-001: localStorage holds only the JWT ('token'). The user record lives in
// memory (this.user), loaded from GET /api/auth/me on every page load.
const LEGACY_USER_KEYS = ['graduateNetwork_user', 'graduateNetwork_users'];

function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
        return null;
    }
}

class AuthManager {
    constructor() {
        this.tokenKey = 'token';
        this.user = null;
        this.permissions = null;
        this._permissionsPromise = null;
        this._readyPromise = null;
        this.init();
    }

    init() {
        try {
            LEGACY_USER_KEYS.forEach((k) => localStorage.removeItem(k));
        } catch (_) { /* ignore */ }
        if (this.isLoggedIn()) {
            document.documentElement.classList.add('rbac-pending');
        }
        this.updateAuthUI();
        this.checkAuth();
    }

    /** Resolves with the full /me user (or token payload if /me is unreachable, null if logged out). */
    whenUserLoaded() {
        if (!this._readyPromise) this.checkAuth();
        return this._readyPromise;
    }

    get ready() {
        return this.whenUserLoaded();
    }

    checkAuth() {
        if (!this.isLoggedIn()) {
            this._readyPromise = Promise.resolve(null);
            return this._readyPromise;
        }
        this._readyPromise = (async () => {
            try {
                const response = await api.auth.getCurrentUser();
                if (response.user) {
                    this.user = { ...response.user };
                    this.updateAuthUI();
                    this.applyPermissionMenus().then(() => {
                        if (window.SchoolBrand) window.SchoolBrand.applyFromUser(this.user);
                    });
                    return this.user;
                }
            } catch (error) {
                if (error && (error.status === 401 || error.code === 'UNAUTHENTICATED')) {
                    this.clearSession();
                    return null;
                }
                console.warn('auth /me failed', error);
            }
            return this.getCurrentUser();
        })();
        return this._readyPromise;
    }

    clearSession() {
        this.user = null;
        this.permissions = null;
        this._permissionsPromise = null;
        try {
            localStorage.removeItem(this.tokenKey);
            LEGACY_USER_KEYS.forEach((k) => localStorage.removeItem(k));
        } catch (_) { /* ignore */ }
        document.documentElement.classList.remove('rbac-pending');
        this.updateAuthUI();
    }

    isLoggedIn() {
        return localStorage.getItem(this.tokenKey) !== null;
    }

    /** Full user after /me; before that, the minimal JWT payload (id, email, name, user_type, role, school_id). */
    getCurrentUser() {
        if (this.user) return this.user;
        const payload = decodeJwtPayload(localStorage.getItem(this.tokenKey));
        if (!payload || !payload.id) return null;
        return {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            user_type: payload.user_type,
            role: payload.role,
            school_id: payload.school_id ?? null,
            _partial: true,
        };
    }

    /** Merge fresh fields into the in-memory user (never persisted). */
    setUser(user) {
        if (!user) return;
        this.user = { ...(this.user || {}), ...user };
    }

    isStaffAdmin(user = this.getCurrentUser()) {
        if (!user) return false;
        return ['admin', 'system_admin', 'school_admin'].includes(user.user_type)
            || ['system_admin', 'school_admin'].includes(user.role);
    }

    isSystemAdmin(user = this.getCurrentUser()) {
        if (!user) return false;
        return user.user_type === 'admin' || user.user_type === 'system_admin' || user.role === 'system_admin';
    }

    login(userData, token) {
        localStorage.setItem(this.tokenKey, token);
        this.user = userData ? { ...userData } : null;
        this._readyPromise = Promise.resolve(this.getCurrentUser());
        this.permissions = null;
        this._permissionsPromise = null;
        document.documentElement.classList.add('rbac-pending');
        this.updateAuthUI();
        this.applyPermissionMenus().then(() => {
            if (window.SchoolBrand) {
                window.SchoolBrand.applyFromUser(userData);
            }
        });
    }

    logout() {
        this.clearSession();
        window.location.href = 'index.html';
    }

    menuCodeForHref(href) {
        if (!href) return null;
        const path = href.split('?')[0];
        if (path.includes('company-profile')) return 'jobs';
        if (path.includes('applicant-detail')) return 'applications';
        if (path.includes('admin-permissions')) return 'schools';
        if (path.includes('admin-codes') || path.includes('admin-schools')) return 'schools';
        if (path.includes('admin-users')) return 'users';
        if (path.includes('company-approval')) return 'company_approval';
        if (path.includes('admin-jobs') || path.includes('job-create') || path.includes('job-edit')) return 'jobs';
        if (path.includes('admin-board')) return 'community';
        if (path.includes('admin-announcements') || path.includes('industry-visit') || path.includes('job-fair')) return 'field_trips';
        if (path.includes('counseling-journal') || path.includes('counseling.html')) return 'counseling';
        if (path.includes('career.html')) return 'resumes';
        if (path.includes('jobs.html')) return 'jobs';
        if (path.includes('networking')) return 'community';
        return null;
    }

    /** Minimum action for a menu link: data-menu-min="manage|write|read|apply" */
    menuMinAction(link, href) {
        const explicit = link.getAttribute('data-menu-min');
        if (explicit) return explicit;
        const path = (href || '').split('?')[0];
        if (path.includes('admin-permissions')) return 'manage';
        if (path.includes('admin-codes') || path.includes('admin-schools')) return 'write';
        if (path.includes('job-create') || path.includes('job-edit') || path.includes('company-profile')) return 'write';
        return null;
    }

    hasMenuAction(menuCode, action) {
        if (!this.permissions || !this.permissions.menus) return null;
        const entry = this.permissions.menus.find((m) => m.code === menuCode);
        if (!entry) return false;
        return (entry.actions || []).includes(action);
    }

    linkAllowed(link) {
        const href = link.getAttribute('href') || '';
        const menu = link.getAttribute('data-menu') || this.menuCodeForHref(href);
        if (!menu) return true;
        if (href.split('?')[0].includes('company-profile')) {
            const user = this.getCurrentUser();
            if (!(user && (user.user_type === 'company' || this.isStaffAdmin(user)))) return false;
        }
        const minAction = this.menuMinAction(link, href);
        if (minAction) {
            return this.hasMenuAction(menu, minAction) === true;
        }
        return this.hasMenuAction(menu, 'read')
            || this.hasMenuAction(menu, 'write')
            || this.hasMenuAction(menu, 'manage')
            || this.hasMenuAction(menu, 'apply');
    }

    async ensurePermissions() {
        if (this.permissions) return this.permissions;
        if (this._permissionsPromise) return this._permissionsPromise;
        this._permissionsPromise = api.auth.permissions()
            .then((data) => {
                this.permissions = data;
                return data;
            })
            .catch((err) => {
                this._permissionsPromise = null;
                throw err;
            });
        return this._permissionsPromise;
    }

    async applyPermissionMenus() {
        const user = this.getCurrentUser();
        if (!user) {
            document.documentElement.classList.remove('rbac-pending');
            return;
        }

        const adminMenuSection = document.getElementById('adminMenuSection');
        // Never show admin chrome until permissions are known (prevents flicker).
        if (adminMenuSection) {
            adminMenuSection.style.display = 'none';
        }

        try {
            await this.ensurePermissions();
        } catch (err) {
            console.warn('permissions load failed', err);
            document.documentElement.classList.remove('rbac-pending');
            return;
        }

        const links = document.querySelectorAll('.sidebar-menu a.menu-item, #adminMenuSection a.menu-item');
        links.forEach((link) => {
            const menu = link.getAttribute('data-menu') || this.menuCodeForHref(link.getAttribute('href') || '');
            if (!menu) return;
            const allowed = this.linkAllowed(link);
            if (allowed === false) {
                link.style.display = 'none';
                link.setAttribute('aria-hidden', 'true');
            } else {
                link.style.display = '';
                link.removeAttribute('aria-hidden');
            }
        });

        if (adminMenuSection) {
            // Admin pages guard with requireStaffAdmin(); teachers with e.g. field_trips:write stay out.
            const canAdmin = this.isStaffAdmin(user) && (this.hasMenuAction('schools', 'write')
                || this.hasMenuAction('schools', 'manage')
                || this.hasMenuAction('users', 'write')
                || this.hasMenuAction('users', 'manage')
                || this.hasMenuAction('company_approval', 'read')
                || this.hasMenuAction('company_approval', 'write')
                || this.hasMenuAction('jobs', 'manage')
                || this.hasMenuAction('community', 'manage')
                || this.hasMenuAction('stats', 'read'));
            adminMenuSection.classList.remove('rbac-pending');
            adminMenuSection.style.display = canAdmin ? 'block' : 'none';
        }

        document.documentElement.classList.remove('rbac-pending');
        document.documentElement.classList.add('rbac-ready');
    }

    /** Display label for badges/menus (admin → 시스템 관리자) */
    roleDisplayLabel(user = this.getCurrentUser()) {
        if (window.RoleLabels) return RoleLabels.displayRoleLabel(user);
        if (!user) return '';
        if (user.user_type === 'admin' || user.user_type === 'system_admin' || user.role === 'system_admin') {
            return '시스템 관리자';
        }
        return user.user_type || '';
    }

    updateAuthUI() {
        const user = this.getCurrentUser();
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        const userName = document.getElementById('userName');

        if (user) {
            if (authButtons) authButtons.style.display = 'none';
            if (userMenu) userMenu.style.display = 'flex';
            if (userName && user.name) userName.textContent = user.name;
            // Do NOT reveal adminMenuSection here — wait for applyPermissionMenus.
        } else {
            if (authButtons) authButtons.style.display = 'flex';
            if (userMenu) userMenu.style.display = 'none';
            const adminMenuSection = document.getElementById('adminMenuSection');
            if (adminMenuSection) adminMenuSection.style.display = 'none';
        }
    }

    requireAuth() {
        if (!this.isLoggedIn()) {
            alert('로그인이 필요한 서비스입니다.');
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = 'login.html?returnUrl=' + returnUrl;
            return false;
        }
        return true;
    }

    requireStaffAdmin() {
        if (!this.requireAuth()) return false;
        if (!this.isStaffAdmin()) {
            alert('관리자만 접근할 수 있습니다.');
            window.location.href = 'dashboard.html';
            return false;
        }
        return true;
    }
}

const auth = new AuthManager();

function logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
        auth.logout();
    }
}

function navigateToService(url) {
    if (auth.isLoggedIn()) {
        window.location.href = url;
    } else {
        alert('로그인이 필요한 서비스입니다.');
        window.location.href = 'login.html?returnUrl=' + encodeURIComponent(url);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    auth.updateAuthUI();
    if (auth.isLoggedIn()) {
        auth.applyPermissionMenus();
    } else {
        document.documentElement.classList.remove('rbac-pending');
    }
});
