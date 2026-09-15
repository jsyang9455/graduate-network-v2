// Authentication Management
class AuthManager {
    constructor() {
        this.storageKey = 'graduateNetwork_user';
        this.tokenKey = 'token';
        this.permissions = null;
        this.init();
    }

    init() {
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
                    this.applyPermissionMenus();
                }
            } catch (error) {
                if (error.message && (error.message.includes('Invalid token') || error.message.includes('Unauthorized') || error.message.includes('Authentication required') || error.message.includes('UNAUTHENTICATED'))) {
                    localStorage.removeItem(this.storageKey);
                    localStorage.removeItem(this.tokenKey);
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
        this.updateAuthUI();
        this.applyPermissionMenus();
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
    if (path.includes('admin-codes')) return 'schools';
        if (path.includes('admin-users')) return 'users';
        if (path.includes('admin-jobs') || path.includes('job-create') || path.includes('job-edit')) return 'jobs';
        if (path.includes('admin-board')) return 'community';
        if (path.includes('admin-announcements') || path.includes('industry-visit') || path.includes('job-fair')) return 'field_trips';
        if (path.includes('counseling-journal') || path.includes('counseling.html')) return 'counseling';
        if (path.includes('career.html')) return 'resumes';
        if (path.includes('jobs.html')) return 'jobs';
        if (path.includes('networking')) return 'community';
        return null;
    }

    hasMenuAction(menuCode, action) {
        if (!this.permissions || !this.permissions.menus) return null;
        const entry = this.permissions.menus.find((m) => m.code === menuCode);
        if (!entry) return false;
        return (entry.actions || []).includes(action);
    }

    async applyPermissionMenus() {
        const user = this.getCurrentUser();
        if (!user) return;

        const adminMenuSection = document.getElementById('adminMenuSection');
        if (adminMenuSection && this.isStaffAdmin(user)) {
            adminMenuSection.style.display = 'block';
        }

        try {
            const data = await api.auth.permissions();
            this.permissions = data;
        } catch (err) {
            console.warn('permissions load failed', err);
            return;
        }

        const links = document.querySelectorAll('.sidebar-menu a.menu-item, #adminMenuSection a.menu-item');
        links.forEach((link) => {
            const menu = link.getAttribute('data-menu') || this.menuCodeForHref(link.getAttribute('href') || '');
            if (!menu) return;
            const allowed = this.hasMenuAction(menu, 'read')
                || this.hasMenuAction(menu, 'write')
                || this.hasMenuAction(menu, 'manage')
                || this.hasMenuAction(menu, 'apply');
            if (allowed === false) {
                link.style.display = 'none';
            } else {
                link.style.display = '';
            }
        });

        if (adminMenuSection) {
            const canAdmin = this.hasMenuAction('schools', 'write')
                || this.hasMenuAction('schools', 'manage')
                || this.hasMenuAction('users', 'write')
                || this.hasMenuAction('users', 'manage')
                || this.hasMenuAction('jobs', 'manage')
                || this.hasMenuAction('community', 'manage')
                || this.hasMenuAction('stats', 'read');
            adminMenuSection.style.display = canAdmin ? 'block' : 'none';
        }
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
            if (this.isStaffAdmin(user)) {
                const adminMenuSection = document.getElementById('adminMenuSection');
                if (adminMenuSection) adminMenuSection.style.display = 'block';
            }
        } else {
            if (authButtons) authButtons.style.display = 'flex';
            if (userMenu) userMenu.style.display = 'none';
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
    }
});
