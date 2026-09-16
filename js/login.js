// Login functionality
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    // Check URL parameters for return URL
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');

    // Handle form submission
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showError('이메일과 비밀번호를 입력해주세요.');
            return;
        }

        performLogin(email, password);
    });

    function performLogin(email, password) {
        hideError();

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '로그인 중...';
        submitBtn.disabled = true;

        // 백엔드 API 로그인 (기업 approval pending은 로그인 자체는 허용 — 공고 등록만 차단)
        api.auth.login(email, password)
            .then(response => {
                auth.login(response.user, response.token);

                const successMsg = document.getElementById('loginSuccess');
                const urlParams = new URLSearchParams(window.location.search);
                const returnUrl = urlParams.get('returnUrl');

                if (successMsg) {
                    successMsg.textContent = '로그인 성공! 이동합니다...';
                    successMsg.style.display = 'block';
                }

                setTimeout(() => {
                    window.location.href = returnUrl || 'dashboard.html';
                }, 1000);
            })
            .catch(err => {
                showError(loginErrorMessage(err));
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
    }

    function loginErrorMessage(err) {
        const code = err && err.code;
        const status = err && err.status;
        const msg = (err && err.message) || '';

        if (code === 'NETWORK' || msg === 'NETWORK' || /Failed to fetch|NetworkError|Load failed/i.test(msg)) {
            return '서버에 연결할 수 없습니다. 네트워크·API 주소를 확인한 뒤 새로고침 해주세요.';
        }
        if (status === 404 || code === 'NOT_FOUND') {
            return '로그인 API를 찾을 수 없습니다. 배포(nginx /api 프록시)를 확인해주세요.';
        }
        if (status === 401 || code === 'UNAUTHENTICATED' || /Invalid credentials/i.test(msg)) {
            return '이메일 또는 비밀번호가 올바르지 않습니다.';
        }
        if (status === 400 || code === 'VALIDATION') {
            return '이메일 형식을 확인해주세요.';
        }
        if (status >= 500) {
            return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        }
        return msg && msg !== 'Request failed'
            ? msg
            : '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
    }

    function showError(message) {
        loginError.textContent = message;
        loginError.style.display = 'block';
        setTimeout(() => {
            loginError.style.display = 'none';
        }, 5000);
    }

    function hideError() {
        loginError.style.display = 'none';
    }

    // Social login handlers
    document.querySelectorAll('.btn-social').forEach(btn => {
        btn.addEventListener('click', function() {
            alert('소셜 로그인 기능은 준비중입니다.');
        });
    });
});
