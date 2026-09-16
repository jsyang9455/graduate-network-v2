// Authentication Management
class AuthManager {
    constructor() {
        this.storageKey = 'graduateNetwork_user';
        this.tokenKey = 'token';
        this.permissions = null;
        this._permissionsPromise = null;
        this.init();
    }

    init() {
        if (this.isLoggedIn()) {
            document.documentElement.classList.add('rbac-pending');
        }
        this.updateAuthUI();
        this.checkAuth();
    }

    async checkAuth() {
        const token = localStorage.getItem(this.tokenKey);
        if (token) {
            try {
                const response = await api.auth.getCurrentUser();
                if (response.user) {
                    localStorage.setItem(this.storageKey, JSON.stringify(response.user));
                    this.updateAuthUI();
                    await this.applyPermissionMenus();
                    if (window.SchoolBrand) {
                        window.SchoolBrand.applyFromUser(response.user);
                    }
                }
            } catch (error) {
                if (error.message && (error.message.includes('Invalid token') || error.message.includes('Unauthorized') || error.message.includes('Authentication required') || error.message.includes('UNAUTHENTICATED'))) {
                    localStorage.removeItem(this.storageKey);
                    localStorage.removeItem(this.tokenKey);
                    document.documentElement.classList.remove('rbac-pending');
                    this.updateAuthUI();
                }
            }
        }
    }

    isLoggedIn() {
        return localStorage.getItem(this.tokenKey) !== null;
    }

    getCurrentUser() {
        const userStr = localStorage.getItem(this.storageKey);
        return userStr ? JSON.parse(userStr) : null;
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
        localStorage.setItem(this.storageKey, JSON.stringify(userData));
        localStorage.setItem(this.tokenKey, token);
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
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.tokenKey);
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
            const canAdmin = this.hasMenuAction('schools', 'write')
                || this.hasMenuAction('schools', 'manage')
                || this.hasMenuAction('users', 'write')
                || this.hasMenuAction('users', 'manage')
                || this.hasMenuAction('company_approval', 'read')
                || this.hasMenuAction('company_approval', 'write')
                || this.hasMenuAction('jobs', 'manage')
                || this.hasMenuAction('community', 'manage')
                || this.hasMenuAction('stats', 'read');
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
            if (userMenu) {
                userMenu.style.display = 'flex';
                if (userName) userName.textContent = user.name;
            }
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
