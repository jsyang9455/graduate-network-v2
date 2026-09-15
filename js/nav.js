/**
 * Shared mobile navigation: hamburger + drawer for top header,
 * and off-canvas sidebar for dashboard/admin layouts.
 * RBAC: uses existing DOM nodes (no clones) so permission hiding still applies.
 */
(function (global) {
  const MQ = '(max-width: 768px)';
  const OPEN_CLASS = 'nav-open';
  const SIDEBAR_ONLY_CLASS = 'has-mobile-sidebar-bar';

  let state = {
    toggle: null,
    backdrop: null,
    drawer: null,
    sidebar: null,
    sidebarHome: null,
    sidebarNext: null,
    headerNav: null,
    lastFocus: null,
    mq: null
  };

  function isMobile() {
    return state.mq ? state.mq.matches : window.matchMedia(MQ).matches;
  }

  function getFocusable(container) {
    if (!container) return [];
    return Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function setExpanded(open) {
    if (state.toggle) {
      state.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      state.toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    }
    if (state.drawer) {
      const hide = isMobile() && !open;
      state.drawer.setAttribute('aria-hidden', hide ? 'true' : 'false');
      if (hide) state.drawer.setAttribute('inert', '');
      else state.drawer.removeAttribute('inert');
    }
    if (state.backdrop) {
      state.backdrop.hidden = !open;
      state.backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (state.sidebar && document.body.classList.contains(SIDEBAR_ONLY_CLASS)) {
      const hide = isMobile() && !open;
      state.sidebar.setAttribute('aria-hidden', hide ? 'true' : 'false');
    }
  }

  function lockScroll(lock) {
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  function closeNav() {
    if (!document.body.classList.contains(OPEN_CLASS)) return;
    document.body.classList.remove(OPEN_CLASS);
    setExpanded(false);
    lockScroll(false);
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
      state.lastFocus.focus();
    }
  }

  function openNav() {
    if (!isMobile()) return;
    state.lastFocus = document.activeElement;
    document.body.classList.add(OPEN_CLASS);
    setExpanded(true);
    lockScroll(true);
    const panel = state.drawer || state.sidebar;
    const focusables = getFocusable(panel);
    if (focusables.length) {
      focusables[0].focus();
    } else if (state.toggle) {
      state.toggle.focus();
    }
  }

  function toggleNav() {
    if (document.body.classList.contains(OPEN_CLASS)) closeNav();
    else openNav();
  }

  function onKeydown(e) {
    if (!document.body.classList.contains(OPEN_CLASS)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNav();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = state.drawer || state.sidebar;
    const focusables = getFocusable(panel);
    if (state.toggle) focusables.unshift(state.toggle);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function ensureBackdrop() {
    let el = document.getElementById('navBackdrop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'navBackdrop';
      el.className = 'nav-backdrop';
      el.hidden = true;
      el.addEventListener('click', closeNav);
      document.body.appendChild(el);
    }
    state.backdrop = el;
  }

  function ensureToggle(parent) {
    let btn = parent.querySelector('.nav-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'navDrawer');
      btn.setAttribute('aria-label', '메뉴 열기');
      btn.innerHTML =
        '<span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
      btn.addEventListener('click', toggleNav);
      parent.appendChild(btn);
    }
    state.toggle = btn;
    return btn;
  }

  function wrapHeaderDrawer(headerNav) {
    const existing = headerNav.querySelector('.nav-drawer');
    if (existing) {
      state.drawer = existing;
      return existing;
    }

    const drawer = document.createElement('div');
    drawer.className = 'nav-drawer';
    drawer.id = 'navDrawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', '사이트 메뉴');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'nav-drawer-close';
    closeBtn.setAttribute('aria-label', '메뉴 닫기');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeNav);
    drawer.appendChild(closeBtn);

    const title = document.createElement('p');
    title.className = 'nav-drawer-title';
    title.textContent = '메뉴';
    drawer.appendChild(title);

    const moveSel = ['.nav-links', '.auth-buttons', '.user-menu'];
    moveSel.forEach((sel) => {
      headerNav.querySelectorAll(sel).forEach((node) => {
        if (!drawer.contains(node)) drawer.appendChild(node);
      });
    });

    headerNav.appendChild(drawer);
    state.drawer = drawer;
    // Only inert while closed on mobile; desktop uses display:contents for inline links
    if (isMobile()) {
      drawer.setAttribute('aria-hidden', 'true');
      drawer.setAttribute('inert', '');
    } else {
      drawer.setAttribute('aria-hidden', 'false');
      drawer.removeAttribute('inert');
    }
    return drawer;
  }

  function ensureSidebarMobileBar(sidebar) {
    let bar = document.getElementById('mobileSidebarBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'mobileSidebarBar';
      bar.className = 'mobile-sidebar-bar';
      bar.innerHTML =
        '<a class="mobile-sidebar-brand" href="dashboard.html">' +
        '<img src="images/logo.svg" alt="JJOBB" class="logo-img" width="118" height="40">' +
        '</a>';
      document.body.insertBefore(bar, document.body.firstChild);
      document.body.classList.add(SIDEBAR_ONLY_CLASS);
    }
    ensureToggle(bar);
    if (state.toggle) state.toggle.setAttribute('aria-controls', 'mobileSidebarPanel');
    sidebar.id = sidebar.id || 'mobileSidebarPanel';
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', '메뉴');

    if (!sidebar.querySelector('.nav-drawer-close')) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'nav-drawer-close sidebar-drawer-close';
      closeBtn.setAttribute('aria-label', '메뉴 닫기');
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', closeNav);
      sidebar.insertBefore(closeBtn, sidebar.firstChild);
    }
  }

  function wireDrawerLinks(root) {
    if (!root) return;
    root.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) return;
      closeNav();
    });
  }

  function rememberSidebarHome(sidebar) {
    state.sidebarHome = sidebar.parentNode;
    state.sidebarNext = sidebar.nextSibling;
  }

  function placeSidebarInDrawer() {
    if (!state.sidebar || !state.drawer) return;
    if (state.drawer.contains(state.sidebar)) return;
    let host = state.drawer.querySelector('.nav-drawer-sidebar-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'nav-drawer-sidebar-host';
      const label = document.createElement('p');
      label.className = 'nav-drawer-title';
      label.textContent = '전체 메뉴';
      host.appendChild(label);
      state.drawer.appendChild(host);
    }
    host.appendChild(state.sidebar);
  }

  function restoreSidebar() {
    if (!state.sidebar || !state.sidebarHome) return;
    if (state.sidebarHome.contains(state.sidebar)) return;
    if (state.sidebarNext && state.sidebarNext.parentNode === state.sidebarHome) {
      state.sidebarHome.insertBefore(state.sidebar, state.sidebarNext);
    } else {
      state.sidebarHome.appendChild(state.sidebar);
    }
  }

  function syncLayoutForViewport() {
    if (state.drawer && state.sidebar) {
      if (isMobile()) placeSidebarInDrawer();
      else restoreSidebar();
    }
    if (!isMobile()) {
      closeNav();
      if (state.drawer) {
        state.drawer.setAttribute('aria-hidden', 'false');
        state.drawer.removeAttribute('inert');
      }
    } else if (state.drawer && !document.body.classList.contains(OPEN_CLASS)) {
      state.drawer.setAttribute('aria-hidden', 'true');
      state.drawer.setAttribute('inert', '');
    }
  }

  function onBreakpointChange() {
    syncLayoutForViewport();
  }

  function init() {
    if (document.body.dataset.jjobbNavInit === '1') return;
    document.body.dataset.jjobbNavInit = '1';

    state.mq = window.matchMedia(MQ);
    ensureBackdrop();

    const headerNav =
      document.querySelector('header#mainHeader nav') ||
      document.querySelector('header nav');
    const navLinks = headerNav && headerNav.querySelector('.nav-links');
    const sidebar = document.querySelector('.dashboard-container > .sidebar');

    state.headerNav = headerNav;
    state.sidebar = sidebar;

    if (navLinks && headerNav) {
      wrapHeaderDrawer(headerNav);
      ensureToggle(headerNav);
      if (state.toggle) state.toggle.setAttribute('aria-controls', 'navDrawer');
      wireDrawerLinks(state.drawer);
      if (sidebar) {
        rememberSidebarHome(sidebar);
        sidebar.classList.add('nav-embedded-sidebar');
        wireDrawerLinks(sidebar);
        syncLayoutForViewport();
      }
    } else if (sidebar) {
      ensureSidebarMobileBar(sidebar);
      wireDrawerLinks(sidebar);
    } else {
      return;
    }

    document.addEventListener('keydown', onKeydown);
    if (state.mq.addEventListener) {
      state.mq.addEventListener('change', onBreakpointChange);
    } else if (state.mq.addListener) {
      state.mq.addListener(onBreakpointChange);
    }

    window.addEventListener('resize', () => {
      if (!isMobile()) closeNav();
    });
  }

  global.JjobbNav = {
    init,
    open: openNav,
    close: closeNav,
    toggle: toggleNav
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
