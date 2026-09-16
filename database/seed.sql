-- Initial seed data for testing
-- All passwords: password123 (bcrypt $2b$10$AknqEf4Z… — do NOT restore the old rZ0HwKnI… hash)

-- Insert sample users
INSERT INTO users (email, password_hash, name, user_type, phone) VALUES
-- Graduates
('kim.mingyu@example.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '김민규', 'graduate', '010-1234-5678'),
('lee.jihoon@example.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '이지훈', 'graduate', '010-2345-6789'),
('park.sooyoung@example.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '박수영', 'graduate', '010-3456-7890'),

-- Students
('choi.seungmin@example.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '최승민', 'student', '010-4567-8901'),
('jung.yuna@example.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '정유나', 'student', '010-5678-9012'),

-- Teachers
('teacher.kim@example.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '김선생', 'teacher', '010-6789-0123'),

-- Companies
('hr@samsung.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '삼성전자', 'company', '02-1234-5678'),
('recruit@hyundai.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '현대자동차', 'company', '02-2345-6789'),
('jobs@posco.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '포스코', 'company', '02-3456-7890'),

-- Admin
('admin@jeonjutech.edu', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '관리자', 'admin', '063-1234-5678');

-- Insert graduate profiles
INSERT INTO graduate_profiles (user_id, graduation_year, major, current_company, current_position, career_start_date, bio, skills, is_mentor, mentor_capacity) VALUES
(1, 2018, '전자과', '삼성전자', '주임연구원', '2018-03-01', '전자공학을 전공하고 현재 삼성전자에서 반도체 개발 업무를 담당하고 있습니다.', ARRAY['반도체', 'C++', 'Python', '회로설계'], true, 3),
(2, 2019, '기계과', '현대자동차', '선임기술원', '2019-02-15', '자동차 설계 및 제조 기술 전문가입니다.', ARRAY['CAD', 'SolidWorks', '금형설계', 'AutoCAD'], true, 2),
(3, 2020, '전기과', 'LG전자', '연구원', '2020-03-10', '전기 시스템 설계 및 분석 업무를 하고 있습니다.', ARRAY['전기회로', 'PLC', 'MATLAB', '제어시스템'], false, 0);

-- Insert company profiles
INSERT INTO company_profiles (user_id, company_name, industry, company_size, website, description, founded_year) VALUES
(7, '삼성전자', '전자/반도체', '대기업', 'https://www.samsung.com', '글로벌 전자 및 반도체 선도 기업', 1969),
(8, '현대자동차', '자동차', '대기업', 'https://www.hyundai.com', '국내 1위 자동차 제조 기업', 1967),
(9, '포스코', '철강/금속', '대기업', 'https://www.posco.com', '글로벌 철강 제조 기업', 1968);

-- Insert sample jobs
INSERT INTO jobs (company_id, title, description, requirements, location, job_type, salary_range, experience_level, deadline) VALUES
(7, '반도체 공정 엔지니어', '반도체 제조 공정 개발 및 관리 담당', 
 '- 전자/전기/재료공학 전공\n- 반도체 공정 기초 지식\n- 영어 가능자 우대', 
 '경기도 화성시', 'full-time', '3500만원 ~ 4500만원', 'entry', '2026-03-31'),

(8, '자동차 설계 엔지니어', '친환경 자동차 부품 설계 및 개발', 
 '- 기계공학 전공\n- CAD/CAM 능숙\n- 신입/경력 무관', 
 '울산광역시', 'full-time', '3200만원 ~ 5000만원', 'entry', '2026-02-28'),

(9, '철강 품질관리 담당자', '철강 제품 품질 검사 및 관리', 
 '- 금속공학/재료공학 전공\n- 품질관리 경험자 우대\n- 3교대 근무 가능자', 
 '경상북도 포항시', 'full-time', '3000만원 ~ 4000만원', 'entry', '2026-04-15'),

(7, '전기 시스템 엔지니어', '스마트 팩토리 전기 시스템 구축 및 유지보수', 
 '- 전기공학 전공\n- PLC, 제어 시스템 경험\n- 자격증 소지자 우대', 
 '경기도 수원시', 'full-time', '3300만원 ~ 4200만원', 'junior', '2026-03-15'),

(8, '생산기술 인턴', '자동차 생산라인 기술 지원 및 개선 활동', 
 '- 공업계 고등학교 재학생 또는 졸업생\n- 6개월 인턴 프로그램', 
 '전라북도 전주시', 'internship', '월 200만원', 'entry', '2026-02-20');

-- Insert sample networking connections
INSERT INTO connections (requester_id, receiver_id, status, message) VALUES
(4, 1, 'accepted', '선배님, 반도체 분야에 관심이 많습니다. 조언 부탁드립니다.'),
(5, 2, 'accepted', '자동차 설계에 대해 여쭤보고 싶습니다.'),
(4, 3, 'pending', '전기 시스템에 대해 배우고 싶습니다.');

-- Insert sample mentorships
INSERT INTO mentorships (mentor_id, mentee_id, status, start_date) VALUES
(1, 4, 'active', '2025-12-01'),
(2, 5, 'active', '2025-11-15');

-- Insert sample counseling sessions
INSERT INTO counseling_sessions (user_id, counselor_id, session_type, session_date, topic, status) VALUES
(4, 6, '진로상담', '2026-02-05 14:00:00', '반도체 분야 진로 상담', 'scheduled'),
(5, 6, '취업상담', '2026-02-10 15:00:00', '이력서 작성 및 면접 준비', 'scheduled');

-- Insert sample posts
INSERT INTO posts (user_id, category, title, content, views_count, likes_count) VALUES
(1, '취업정보', '삼성전자 신입 채용 후기', '최근 삼성전자 반도체 부문 신입 공채에 합격했습니다. 준비 과정을 공유합니다...', 245, 32),
(2, '멘토링', '자동차 설계 분야 멘토링 모집', '현대자동차에서 5년차 설계 엔지니어입니다. 후배들에게 도움을 주고 싶습니다.', 189, 28),
(3, '자유게시판', '전주공고 졸업생 모임 안내', '2월 15일 전주에서 졸업생 모임이 있습니다. 많은 참여 부탁드립니다!', 156, 45);

-- Insert sample comments
INSERT INTO comments (post_id, user_id, content) VALUES
(1, 4, '축하드립니다! 혹시 면접 준비는 어떻게 하셨나요?'),
(1, 5, '저도 삼성전자 지원 예정인데 많은 도움이 되었습니다!'),
(2, 4, '멘토링 신청하고 싶습니다!');

-- Insert sample notifications
INSERT INTO notifications (user_id, type, title, message, link) VALUES
(4, 'mentorship', '멘토링 매칭 완료', '김민규 선배님과 멘토링이 매칭되었습니다.', '/mentorship/1'),
(5, 'job', '새로운 채용 공고', '현대자동차에서 신규 채용 공고가 등록되었습니다.', '/jobs/2'),
(1, 'connection', '새로운 연결 요청', '최승민님이 연결을 요청했습니다.', '/networking/connections');
