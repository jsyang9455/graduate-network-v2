// Register functionality (REQ-IAM-006 / company signup)
document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('registerForm');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');
    const studentFields = document.getElementById('studentFields');
    const companyFields = document.getElementById('companyFields');
    const userTypeRadios = document.querySelectorAll('input[name="userType"]');

    loadSchools();
    loadMajors();
    populateGraduationYears();
    applyUserTypeUI(document.querySelector('input[name="userType"]:checked')?.value || 'student');

    userTypeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            applyUserTypeUI(this.value);
        });
    });

    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const userType = document.querySelector('input[name="userType"]:checked').value;
        const formData = {
            userType,
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
            confirmPassword: document.getElementById('confirmPassword').value,
            schoolName: document.getElementById('schoolName').selectedOptions[0]?.text || '',
            schoolId: document.getElementById('schoolName').value,
            agreeTerms: document.getElementById('agreeTerms').checked
        };

        if (userType === 'student' || userType === 'graduate') {
            formData.phone = document.getElementById('phone')?.value || '';
            formData.graduationYear = document.getElementById('graduationYear')?.value || '';
            formData.major = document.getElementById('major')?.value || '';
            formData.departmentName = document.getElementById('departmentName')?.value || '';
            formData.desiredJob = document.getElementById('desiredJob')?.value || '';
        } else if (userType === 'company') {
            formData.companyName = document.getElementById('companyName')?.value.trim() || '';
            formData.phone = document.getElementById('companyPhone')?.value || '';
            formData.industry = document.getElementById('industry')?.value.trim() || '';
            formData.companySize = document.getElementById('companySize')?.value || '';
            formData.website = document.getElementById('companyWebsite')?.value.trim() || '';
            formData.address = document.getElementById('companyAddress')?.value.trim() || '';
        } else if (userType === 'teacher') {
            formData.phone = document.getElementById('phone')?.value || '';
        }

        if (!validateForm(formData)) {
            return;
        }

        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '등록 중...';
        submitBtn.disabled = true;

        try {
            const registerData = {
                email: formData.email,
                password: formData.password,
                name: formData.name,
                user_type: formData.userType,
                phone: formData.phone || '',
                school_name: formData.schoolName,
                school_id: formData.schoolId ? parseInt(formData.schoolId, 10) : null,
                major: formData.major || '',
                department_name: formData.departmentName || '',
                graduation_year: formData.graduationYear ? parseInt(formData.graduationYear, 10) : null,
                desired_job: formData.desiredJob || '',
            };

            if (formData.userType === 'company') {
                registerData.company_name = formData.companyName;
                registerData.industry = formData.industry || null;
                registerData.company_size = formData.companySize || null;
                registerData.website = formData.website || null;
                registerData.address = formData.address || null;
            }

            try {
                const response = await api.auth.register(registerData);
                if (response && response.token) {
                    auth.login(response.user, response.token);
                }
                showSuccess('🎉 회원가입이 완료되었습니다!');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                const next =
                    formData.userType === 'company' ? 'company-profile.html' : 'dashboard.html';
                setTimeout(() => {
                    window.location.href = response && response.token ? next : 'login.html';
                }, 1200);
                return;
            } catch (apiError) {
                if (apiError.message && (apiError.message.includes('already') || apiError.message.includes('registered') || apiError.message.includes('중복'))) {
                    showError('이미 등록된 이메일입니다.');
                } else {
                    showError(apiError.message || '회원가입에 실패했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
                    console.error('회원가입 API 오류:', apiError.message);
                }
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                return;
            }
        } catch (error) {
            showError(error.message || '회원가입에 실패했습니다. 다시 시도해주세요.');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });

    function applyUserTypeUI(userType) {
        const nameLabel = document.getElementById('nameLabel');
        const nameInput = document.getElementById('name');
        const schoolLabel = document.getElementById('schoolLabel');
        const schoolHint = document.getElementById('schoolHint');

        const phoneInput = document.getElementById('phone');
        const graduationYearInput = document.getElementById('graduationYear');
        const majorInput = document.getElementById('major');
        const departmentNameInput = document.getElementById('departmentName');
        const companyNameInput = document.getElementById('companyName');
        const companyPhoneInput = document.getElementById('companyPhone');

        if (userType === 'company') {
            if (studentFields) studentFields.style.display = 'none';
            if (companyFields) companyFields.style.display = 'block';
            if (nameLabel) nameLabel.textContent = '담당자 이름 *';
            if (nameInput) nameInput.placeholder = '채용 담당자 실명';
            if (schoolLabel) schoolLabel.textContent = '협력(게시 대상) 학교 *';
            if (schoolHint) schoolHint.style.display = 'block';

            [phoneInput, graduationYearInput, majorInput, departmentNameInput].forEach((el) => {
                if (el) el.removeAttribute('required');
            });
            if (companyNameInput) companyNameInput.setAttribute('required', 'required');
            if (companyPhoneInput) companyPhoneInput.setAttribute('required', 'required');
            return;
        }

        if (companyFields) companyFields.style.display = 'none';
        if (nameLabel) nameLabel.textContent = '이름 *';
        if (nameInput) nameInput.placeholder = '실명을 입력하세요';
        if (schoolLabel) schoolLabel.textContent = '소속 학교 *';
        if (schoolHint) schoolHint.style.display = 'none';
        if (companyNameInput) companyNameInput.removeAttribute('required');
        if (companyPhoneInput) companyPhoneInput.removeAttribute('required');

        if (userType === 'teacher') {
            if (studentFields) studentFields.style.display = 'none';
            [phoneInput, graduationYearInput, majorInput, departmentNameInput].forEach((el) => {
                if (el) el.removeAttribute('required');
            });
        } else {
            if (studentFields) studentFields.style.display = 'block';
            [phoneInput, graduationYearInput, majorInput, departmentNameInput].forEach((el) => {
                if (el) el.setAttribute('required', 'required');
            });
        }
    }

    function populateGraduationYears() {
        const graduationYearInput = document.getElementById('graduationYear');
        if (graduationYearInput && graduationYearInput.tagName === 'SELECT') {
            const currentYear = 2026;
            for (let year = currentYear; year >= 1980; year--) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year + '년';
                graduationYearInput.appendChild(option);
            }
        }
    }

    function validateForm(data) {
        if (!data.name || !data.email || !data.password || !data.schoolId) {
            showError('필수 항목을 모두 입력해주세요.');
            return false;
        }

        if (data.userType === 'student' || data.userType === 'graduate') {
            if (!data.phone || !data.graduationYear) {
                showError('필수 항목을 모두 입력해주세요. (전화번호, 졸업년도)');
                return false;
            }
            if (!data.major) {
                showError('전공을 선택해주세요.');
                return false;
            }
            if (!data.departmentName) {
                showError('학과명을 입력해주세요.');
                return false;
            }
            const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
            if (!phoneRegex.test(data.phone.replace(/-/g, ''))) {
                showError('올바른 연락처 형식이 아닙니다. (예: 010-1234-5678)');
                return false;
            }
        }

        if (data.userType === 'company') {
            if (!data.companyName) {
                showError('기업명을 입력해주세요.');
                return false;
            }
            if (!data.phone) {
                showError('담당자 연락처를 입력해주세요.');
                return false;
            }
            const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
            const digits = data.phone.replace(/-/g, '');
            if (!phoneRegex.test(digits) && !/^0\d{1,2}\d{7,8}$/.test(digits)) {
                showError('올바른 연락처 형식이 아닙니다. (예: 010-1234-5678)');
                return false;
            }
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            showError('올바른 이메일 형식이 아닙니다.');
            return false;
        }

        if (data.password.length < 8) {
            showError('비밀번호는 8자 이상이어야 합니다.');
            return false;
        }

        if (data.password !== data.confirmPassword) {
            showError('비밀번호가 일치하지 않습니다.');
            return false;
        }

        if (!data.agreeTerms) {
            showError('필수 약관에 동의해주세요.');
            return false;
        }

        return true;
    }

    function showError(message) {
        registerError.textContent = message;
        registerError.style.display = 'block';
        registerSuccess.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showSuccess(message) {
        registerSuccess.textContent = message;
        registerSuccess.style.display = 'block';
        registerError.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function loadSchools() {
        const schoolSelect = document.getElementById('schoolName');
        if (!schoolSelect) return;

        try {
            const response = await api.schools.list();
            const schools = response.schools || [];

            while (schoolSelect.options.length > 1) {
                schoolSelect.remove(1);
            }

            schools.forEach(school => {
                const option = document.createElement('option');
                option.value = school.id;
                option.textContent = school.name;
                schoolSelect.appendChild(option);
            });
        } catch (error) {
            console.error('학교 목록 로드 실패:', error);
        }
    }

    async function loadMajors() {
        const majorSelect = document.getElementById('major');
        if (!majorSelect) return;

        try {
            const response = await api.get('/majors');
            const majors = response.majors || [];

            while (majorSelect.options.length > 1) {
                majorSelect.remove(1);
            }

            majors.forEach(major => {
                const option = document.createElement('option');
                option.value = major.name;
                option.textContent = major.name;
                majorSelect.appendChild(option);
            });
        } catch (error) {
            console.error('학과 목록 로드 실패:', error);
            const defaultMajors = ['기계과', '전기과', '전자과', '컴퓨터과', '건축과', '토목과'];
            defaultMajors.forEach(major => {
                const option = document.createElement('option');
                option.value = major;
                option.textContent = major;
                majorSelect.appendChild(option);
            });
        }
    }
});
