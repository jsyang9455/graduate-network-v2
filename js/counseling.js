// Counseling page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Hide student-only menus for company users and redirect
    const user = auth.getCurrentUser();
    if (user && user.user_type === 'company') {
        alert('기업 계정은 진로 상담 서비스를 이용할 수 없습니다.');
        window.location.href = 'dashboard.html';
        return;
    }

    // 교사 계정이지만 상담교사로 지정되지 않은 경우 차단
    if (user && user.user_type === 'teacher' && !user.is_counselor) {
        alert('상담교사로 지정된 교사만 진로 상담 서비스를 이용할 수 있습니다.\n관리자에게 상담교사 권한을 요청하세요.');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Setup tab navigation
    setupTabNavigation();
    
    // Load teachers into dropdown and list
    loadTeachers();
    
    setupCounselingForm();
    setupCounselorBooking();
    setupHistoryActions();

    // Set minimum date to today
    const counselingDate = document.getElementById('counselingDate');
    if (counselingDate) {
        const today = new Date().toISOString().split('T')[0];
        counselingDate.min = today;
    }
    
    // Show/hide tabs based on user type
    if (user && user.user_type === 'teacher') {
        // Hide career menu for teacher
        const careerMenu = document.getElementById('careerMenu');
        if (careerMenu) careerMenu.style.display = 'none';
        
        document.getElementById('studentTabs').style.display = 'none';
        document.getElementById('teacherTabs').style.display = 'flex';
        document.getElementById('apply-tab').style.display = 'none';
        document.getElementById('requests-tab').style.display = 'block';
        document.getElementById('pageSubtitle').textContent = '학생들의 상담 요청을 관리하고 응답하세요';
        
        // Load counseling requests for teacher
        loadTeacherCounselingRequests();
    } else {
        // Load student's counseling requests
        loadMyCounselingRequests();
    }
});

function setupTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            // Update active button
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Update visible content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });
            
            const targetTab = document.getElementById(tabName + '-tab');
            if (targetTab) {
                targetTab.style.display = 'block';
            }
        });
    });
}

async function loadTeachers() {
    const counselorSelect = document.getElementById('counselor');
    const teachersList = document.getElementById('teachersList');

    let teachers = [];

    // 1차: /counseling/teachers (신규 엔드포인트)
    // 2차: /users?user_type=teacher (구버전 백엔드 fallback)
    try {
        const data = await api.get('/counseling/teachers');
        teachers = data.teachers || [];
    } catch (firstErr) {
        console.warn('/counseling/teachers 실패, fallback 시도:', firstErr.message);
        try {
            const json = await api.get('/users?user_type=teacher&is_counselor=true&limit=100');
            teachers = (json.users || []).map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                school_name: u.school_name || null
            }));
        } catch (secondErr) {
            console.error('교사 목록 fallback도 실패:', secondErr.message);
        }
    }

    // Load into dropdown
    if (counselorSelect) {
        counselorSelect.innerHTML = '<option value="">상담교사를 선택하세요</option>';
        if (teachers.length === 0) {
            counselorSelect.innerHTML += '<option disabled>등록된 상담교사가 없습니다</option>';
        } else {
            teachers.forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.id;
                option.textContent = `${teacher.name} 선생님 (${teacher.school_name || '전북지역 졸업생 네트워크'})`;
                counselorSelect.appendChild(option);
            });
        }
    }

    // Load into teachers list
    if (teachersList) {
        if (teachers.length === 0) {
            teachersList.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">등록된 상담교사가 없습니다.</p>';
        } else {
            teachersList.innerHTML = teachers.map(teacher => `
                <div class="teacher-card">
                    <div class="teacher-avatar"><span>${teacher.name ? teacher.name.charAt(0) : 'T'}</span></div>
                    <div class="teacher-info">
                        <h3>${teacher.name} 선생님</h3>
                        <p>🏫 ${teacher.school_name || '전북지역 졸업생 네트워크'}</p>
                        <p>📧 ${teacher.email}</p>
                        <p>📚 전문 분야: 종합 상담</p>
                    </div>
                    <div class="teacher-actions">
                        <button class="btn btn-primary" onclick="requestCounselingWithTeacher('${teacher.id}', '${teacher.name}')">상담 신청</button>
                        <button class="btn btn-secondary" onclick="sendMessageToTeacher('${teacher.id}', '${teacher.name}')">메시지 보내기</button>
                    </div>
                </div>
            `).join('');
        }
    }
}

function requestCounselingWithTeacher(teacherId, teacherName) {
    // Switch to apply tab
    document.querySelector('.tab-btn[data-tab="apply"]').click();
    
    // Pre-select the teacher
    const counselorSelect = document.getElementById('counselor');
    if (counselorSelect) {
        counselorSelect.value = teacherId;
    }
    
    // Scroll to form
    document.getElementById('counselingForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    alert(`${teacherName} 선생님과의 상담을 신청합니다.\n아래 양식을 작성해주세요.`);
}

async function sendMessageToTeacher(teacherId, teacherName) {
    const message = prompt(`${teacherName} 선생님에게 보낼 메시지를 입력하세요:`);

    if (message && message.trim()) {
        try {
            await api.post('/messages', { to_user_id: teacherId, message: message.trim() });
            alert('메시지가 전송되었습니다!');
        } catch (err) {
            alert('전송 실패: ' + (err.message || '오류가 발생했습니다.'));
        }
    }
}

window.requestCounselingWithTeacher = requestCounselingWithTeacher;
window.sendMessageToTeacher = sendMessageToTeacher;

function setupCounselingForm() {
    const form = document.getElementById('counselingForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!auth.isLoggedIn()) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'login.html';
            return;
        }

        const counselorId = document.getElementById('counselor').value;
        const counselingDate = document.getElementById('counselingDate').value;
        const counselingTime = document.getElementById('counselingTime').value;
        const counselingType = document.getElementById('counselingType').value;
        const counselingTitle = document.getElementById('counselingTitle').value;
        const counselingContent = document.getElementById('counselingContent').value;

        if (!counselingType || !counselorId || !counselingTitle || !counselingContent ||
            !counselingDate || !counselingTime) {
            alert('모든 필수 항목을 입력해주세요.');
            return;
        }

        const sessionDatetime = counselingDate + 'T' + counselingTime + ':00';

        try {
            await api.post('/counseling', {
                session_type: counselingType,
                session_date: sessionDatetime,
                duration_minutes: 60,
                topic: counselingTitle + '\n' + counselingContent,
                counselor_id: counselorId || null
            });
            alert('상담 예약이 완료되었습니다!\n담당 선생님이 확인 후 연락드리겠습니다.');
            form.reset();
            await loadMyCounselingRequests();
        } catch (err) {
            alert('신청 실패: ' + err.message);
        }
    });
}

function setupCounselorBooking() {
    const bookingBtns = document.querySelectorAll('.counselor-card .btn');
    bookingBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (!auth.isLoggedIn()) {
                alert('로그인이 필요한 서비스입니다.');
                window.location.href = 'login.html';
                return;
            }

            const card = this.closest('.counselor-card');
            const counselor = card.querySelector('h3').textContent;
            
            // Pre-fill form and scroll to it
            alert(`${counselor}와의 상담 예약을 진행합니다.\n아래 양식을 작성해주세요.`);
            document.getElementById('counselingForm').scrollIntoView({ behavior: 'smooth' });
        });
    });
}

function setupHistoryActions() {
    // Change button
    const changeBtns = document.querySelectorAll('.history-actions .btn-secondary');
    changeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const card = this.closest('.history-card');
            const date = card.querySelector('.history-info p').textContent;
            
            if (confirm('예약을 변경하시겠습니까?')) {
                alert('예약 변경 페이지로 이동합니다.');
                // In production, this would open a modal or new page
            }
        });
    });

    // Cancel button
    const cancelBtns = document.querySelectorAll('.history-actions .btn-danger');
    cancelBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (confirm('정말 예약을 취소하시겠습니까?')) {
                const card = this.closest('.history-card');
                card.remove();
                alert('예약이 취소되었습니다.');
            }
        });
    });

    // Review button
    const reviewBtns = document.querySelectorAll('.history-actions .btn-primary');
    reviewBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const card = this.closest('.history-card');
            const counselor = card.querySelectorAll('.history-info p')[1].textContent;
            
            const rating = prompt('상담 만족도를 평가해주세요 (1-5):');
            if (rating && rating >= 1 && rating <= 5) {
                const review = prompt('상담 후기를 작성해주세요:');
                if (review) {
                    alert('후기가 등록되었습니다. 감사합니다!');
                }
            }
        });
    });
}

// Load teacher's counseling requests
async function loadTeacherCounselingRequests() {
    const user = auth.getCurrentUser();
    if (!user || user.user_type !== 'teacher') return;

    const container = document.getElementById('counselingRequestsList');
    if (!container) return;

    try {
        const data = await api.get('/counseling');
        const sessions = (data.sessions || []).filter(s => String(s.counselor_id) === String(user.id));

        if (sessions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">상담 신청 내역이 없습니다.</p>';
            return;
        }

        const statusLabel = { pending: '대기중', approved: '승인됨', rejected: '거절됨', scheduled: '예약확정', completed: '완료', cancelled: '취소', 'no-show': '미참석' };
        const statusCls   = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected', scheduled: 'status-approved' };

        container.innerHTML = sessions.map(s => {
            const studentName = s.user_name || '알 수 없음';
            const statusText  = statusLabel[s.status] || s.status;
            const statusClass = statusCls[s.status] || '';
            const sessionDate = s.session_date ? new Date(s.session_date).toLocaleString('ko-KR') : '-';
            const [titlePart, ...rest] = (s.topic || '').split('\n');

            return `
                <div class="request-card" data-request-id="${s.id}">
                    <div class="request-header">
                        <div>
                            <h3>${studentName} 학생</h3>
                            <span class="request-type">${s.session_type || ''}</span>
                            <span class="request-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="request-date">${new Date(s.created_at || s.session_date).toLocaleDateString('ko-KR')}</div>
                    </div>
                    <div class="request-body">
                        <h4>${titlePart || ''}</h4>
                        <p>${rest.join('\n') || ''}</p>
                        <div class="request-info"><span>📅 희망 일시: ${sessionDate}</span></div>
                    </div>
                    ${s.status === 'pending' ? `
                        <div class="request-actions">
                            <button class="btn btn-primary" onclick="approveCounselingRequest(${s.id}, '${studentName}')">✓ 승인</button>
                            <button class="btn btn-danger" onclick="rejectCounselingRequest(${s.id}, '${studentName}')">✗ 거절</button>
                        </div>
                    ` : s.notes ? `<div class="request-response"><strong>응답 메시지:</strong> ${s.notes}</div>` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p style="text-align: center; color: #e74c3c;">목록을 불러오지 못했습니다: ' + err.message + '</p>';
    }
}

window.approveCounselingRequest = approveCounselingRequest;
window.rejectCounselingRequest  = rejectCounselingRequest;
// Approve counseling request
async function approveCounselingRequest(sessionId, studentName) {
    const message = prompt(`${studentName} 학생의 상담 신청을 승인합니다.\n학생에게 전달할 메시지를 입력하세요:`, '상담 신청이 승인되었습니다. 지정하신 날짜와 시간에 만나요!');
    if (message === null) return;

    try {
        await api.put('/counseling/' + sessionId, { status: 'approved', notes: message });
        alert('상담 신청이 승인되었습니다.');
        await loadTeacherCounselingRequests();
    } catch (err) {
        alert('승인 실패: ' + err.message);
    }
}

// Reject counseling request
async function rejectCounselingRequest(sessionId, studentName) {
    const message = prompt(`${studentName} 학생의 상담 신청을 거절합니다.\n학생에게 전달할 사유를 입력하세요:`, '죄송합니다. 해당 시간에 다른 일정이 있어 상담이 어렵습니다.');
    if (message === null) return;

    try {
        await api.put('/counseling/' + sessionId, { status: 'rejected', notes: message });
        alert('상담 신청이 거절되었습니다.');
        await loadTeacherCounselingRequests();
    } catch (err) {
        alert('거절 처리 실패: ' + err.message);
    }
}

// Load student's counseling requests
async function loadMyCounselingRequests() {
    const user = auth.getCurrentUser();
    if (!user || user.user_type === 'teacher') return;

    const container = document.getElementById('myCounselingList');
    if (!container) return;

    try {
        const data = await api.get('/counseling');
        const sessions = (data.sessions || []).filter(s => String(s.user_id) === String(user.id));

        if (sessions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">신청한 상담 내역이 없습니다.</p>';
            return;
        }

        const statusLabel = { pending: '대기중', approved: '승인됨', rejected: '거절됨', scheduled: '예약확정', completed: '완료', cancelled: '취소', 'no-show': '미참석' };
        const statusCls   = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected', scheduled: 'status-approved' };

        container.innerHTML = sessions.map(s => {
            const teacherName = s.counselor_name || '미배정';
            const statusText  = statusLabel[s.status] || s.status;
            const statusClass = statusCls[s.status] || '';
            const sessionDate = s.session_date ? new Date(s.session_date).toLocaleString('ko-KR') : '-';
            const [titlePart, ...rest] = (s.topic || '').split('\n');

            return `
                <div class="request-card">
                    <div class="request-header">
                        <div>
                            <h3>${teacherName} 선생님</h3>
                            <span class="request-type">${s.session_type || ''}</span>
                            <span class="request-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="request-date">${new Date(s.created_at || s.session_date).toLocaleDateString('ko-KR')}</div>
                    </div>
                    <div class="request-body">
                        <h4>${titlePart || ''}</h4>
                        <p>${rest.join('\n') || ''}</p>
                        <div class="request-info"><span>📅 희망 일시: ${sessionDate}</span></div>
                    </div>
                    ${s.notes ? `
                        <div class="request-response ${s.status === 'approved' ? 'response-approved' : 'response-rejected'}">
                            <strong>${s.status === 'approved' ? '✓ 승인 메시지:' : '✗ 거절 사유:'}</strong>
                            <p>${s.notes}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p style="text-align: center; color: #e74c3c;">목록을 불러오지 못했습니다: ' + err.message + '</p>';
    }
}
