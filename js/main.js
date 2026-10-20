// Main page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Real-time stats update (1회만 실행)
    updateStats();

    // Smooth scroll
    setupSmoothScroll();

    // Fade-in animations
    setupScrollAnimations();

    setupHeroCarousel();
});

function setupHeroCarousel() {
    const root = document.getElementById('heroCarousel');
    if (!root) return;
    const slides = Array.from(root.querySelectorAll('.hero-slide'));
    if (slides.length < 2) return;

    const currentEl = root.querySelector('[data-hero-current]');
    const totalEl = root.querySelector('[data-hero-total]');
    if (totalEl) totalEl.textContent = String(slides.length);

    let index = 0;
    let timer = null;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function show(next) {
        index = (next + slides.length) % slides.length;
        slides.forEach((slide, i) => {
            const active = i === index;
            slide.classList.toggle('is-active', active);
            slide.setAttribute('aria-hidden', active ? 'false' : 'true');
            slide.querySelectorAll('a, button').forEach((el) => {
                if (active) el.removeAttribute('tabindex');
                else el.setAttribute('tabindex', '-1');
            });
        });
        if (currentEl) currentEl.textContent = String(index + 1);
    }

    function start() {
        if (reduceMotion) return;
        stop();
        timer = setInterval(() => show(index + 1), 6000);
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
    }

    root.querySelector('[data-hero-prev]')?.addEventListener('click', () => { show(index - 1); start(); });
    root.querySelector('[data-hero-next]')?.addEventListener('click', () => { show(index + 1); start(); });
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);

    show(0);
    start();
}

async function updateStats() {
    try {
        const stats = await api.get('/stats');

        const totalStudentsEl = document.getElementById('totalStudents');
        const employmentRateEl = document.getElementById('employmentRate');
        const activeMembersEl = document.getElementById('activeMembers');

        if (totalStudentsEl && stats.total_students) {
            totalStudentsEl.textContent = stats.total_students.value || '0';
            const lbl = totalStudentsEl.closest('.stat-card')?.querySelector('.stat-label');
            if (lbl && stats.total_students.label) lbl.textContent = stats.total_students.label;
        }
        if (employmentRateEl && stats.employment_rate) {
            employmentRateEl.textContent = stats.employment_rate.value || '0%';
            const lbl = employmentRateEl.closest('.stat-card')?.querySelector('.stat-label');
            if (lbl && stats.employment_rate.label) lbl.textContent = stats.employment_rate.label;
        }
        if (activeMembersEl && stats.active_members) {
            activeMembersEl.textContent = stats.active_members.value || '0';
            const lbl = activeMembersEl.closest('.stat-card')?.querySelector('.stat-label');
            if (lbl && stats.active_members.label) lbl.textContent = stats.active_members.label;
        }
    } catch (error) {
        // 조용히 실패 (콘솔 에러 스팸 방지)
    }
}

function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

function setupScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.service-card, .story-card').forEach(el => {
        observer.observe(el);
    });
}

// Navigate to service with authentication check
function navigateWithAuth(event, url) {
    event.preventDefault();
    event.stopPropagation();
    
    // Check if user is logged in
    if (!auth.isLoggedIn()) {
        alert('로그인이 필요한 서비스입니다.');
        window.location.href = `login.html?returnUrl=${encodeURIComponent(url)}`;
        return;
    }
    
    // User is logged in, navigate to the page
    window.location.href = url;
}
