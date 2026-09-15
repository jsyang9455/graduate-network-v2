# JJOBB v2 — 전북지역 졸업생 취업지원 플랫폼

이 저장소는 [graduate-network](https://github.com/jsyang9455/graduate-network) **1차 시스템**을 기준으로, 전주공업고등학교 「전북지역 졸업생 취업지원 플랫폼 고도화(2차) 구축 과업지시서」(2026.7.)에 따라 고도화하는 **v2**입니다.

- 설계·요구사항·일정: [`docs/`](docs/) (`00`~`08`, [`STATUS.md`](docs/STATUS.md))
- 에이전트 워크플로: [`AGENTS.md`](AGENTS.md)
- 과업지시서 원문 추출: [`docs/spec/고도화-과업지시서.txt`](docs/spec/고도화-과업지시서.txt)

v1 기능(회원·채용·상담·네트워킹 등)을 유지한 채 **멀티스쿨, 메뉴 권한, 이력서/상담 문서화, 워크넷·추천·견학**을 얹습니다. 스택은 Node.js·Express·PostgreSQL·Docker를 계승합니다.

---

# JJOBB - 전주공업고등학교 졸업생 네트워크 플랫폼 (v1 기준 문서)

## 📋 프로젝트 개요

전주공업고등학교 졸업생들을 위한 종합 네트워크 플랫폼입니다. 채용 정보, 동문 네트워킹, 진로 상담, 증명서 발급 등의 기능을 제공합니다.

### 버전 정보
- **v2.0**: 고도화 진행 중 (본 저장소) — 멀티스쿨·권한·문서화. 상세는 `docs/`
- **v1.0**: 초기 릴리스 (2024) - 핵심 기능 완성
- **v1.1**: 보안 개선 및 매뉴얼 추가
  - 테스트 계정 정보 보안 제거
  - 사용자 매뉴얼 및 웹 도움말 추가
  - AWS 배포 가이드 및 자동 설치 스크립트 추가

### 주요 기능
- 🔐 **회원 관리**: 학생, 졸업생, 교사, 기업, 관리자 계정
- 💼 **채용 정보**: 기업 채용 공고 등록 및 지원
- 🤝 **동문 네트워킹**: 졸업생 간 네트워크 구축 및 메시징
- 💬 **진로 상담**: 학생-교사 간 1:1 상담
- 📈 **경력 관리**: 이력서, 경력, 자격증 관리
- 🎓 **교육 프로그램**: 추천 교육 프로그램 정보
- 👥 **관리자 기능**: 회원, 게시판, 프로그램 관리

## 🛠 기술 스택

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Responsive Design
- LocalStorage for data persistence

### Backend
- Node.js + Express
- PostgreSQL Database
- RESTful API

### DevOps
- Docker & Docker Compose
- Nginx (Reverse Proxy)

## 📁 프로젝트 구조

```
graduate-network/
├── backend/                 # 백엔드 서버
│   ├── config/             # 설정 파일
│   │   └── database.js     # DB 연결 설정
│   ├── middleware/         # 미들웨어
│   │   └── auth.js         # 인증 미들웨어
│   ├── routes/             # API 라우트
│   │   ├── auth.js         # 인증 API
│   │   ├── users.js        # 사용자 API
│   │   ├── jobs.js         # 채용 API
│   │   ├── networking.js   # 네트워킹 API
│   │   ├── counseling.js   # 상담 API
│   │   ├── certificates.js # 증명서 API
│   │   └── posts.js        # 게시글 API
│   ├── scripts/            # 유틸리티 스크립트
│   │   ├── migrate.js      # DB 마이그레이션
│   │   └── seed.js         # 초기 데이터 삽입
│   ├── .env.example        # 환경 변수 예제
│   ├── package.json        # 의존성 관리
│   └── server.js           # 서버 진입점
├── database/               # 데이터베이스 스크립트
│   ├── schema.sql          # DB 스키마
│   └── seed.sql            # 초기 데이터
├── css/                    # 스타일시트
├── js/                     # 프론트엔드 JavaScript
└── *.html                  # HTML 페이지

```

## 🚀 빠른 시작

### 로컬 개발 환경

#### 사전 요구사항
- Docker Desktop
- Git

#### Docker Compose로 실행 (권장)

```bash
# 1. 저장소 클론
git clone https://github.com/jsyang9455/graduate-network.git
cd graduate-network

# 2. Docker Compose로 모든 서비스 실행
docker compose up -d

# 3. 브라우저에서 접속
# http://localhost
```

#### 서비스 관리
```bash
# 서비스 중지
docker compose down

# 로그 확인
docker compose logs -f

# 재시작
docker compose restart
```

### AWS Ubuntu 배포

**v2 (이 저장소):** EC2 + Docker Compose 체크리스트는 **[`docs/deploy-aws.md`](docs/deploy-aws.md)** 를 따른다 (`graduate-network-v2`, 루트 `.env`의 `JWT_SECRET` 필수, migrate 011+).

아래 자동 설치·[`AWS-DEPLOYMENT.md`](AWS-DEPLOYMENT.md)는 **v1**(`graduate-network` / `v1.1`) 기준이다. v2 테스트에 쓰지 말 것.

#### 자동 설치 (v1 전용 — v2 비권장)

```bash
# v1.1 스크립트 — graduate-network-v2 에는 사용하지 말 것
curl -fsSL https://raw.githubusercontent.com/jsyang9455/graduate-network/v1.1/deploy-aws.sh -o deploy-aws.sh
chmod +x deploy-aws.sh
./deploy-aws.sh
```

## 📚 문서 및 가이드

### 사용자 가이드
- [**사용자 매뉴얼**](MANUAL.md) - 학생, 교사, 관리자를 위한 상세 가이드
- **웹 도움말** - 앱 실행 후 우측 상단 "📚 도움말" 메뉴 클릭

### 개발자 가이드
- [빠른 시작 가이드](QUICKSTART.md) - 로컬 개발 환경 설정
- [Docker 가이드](DOCKER.md) - Docker 사용법
- [테스트 계정 정보](TEST-ACCOUNTS.md) ⚠️ 개발 전용 (프로덕션 사용 금지)

### 배포 가이드
- [**v2 AWS EC2 + Compose 체크리스트**](docs/deploy-aws.md) — `graduate-network-v2` (권장)
- [AWS Ubuntu 배포 가이드](AWS-DEPLOYMENT.md) — **v1.1 지향** (참고만)
- [자동 설치 스크립트](deploy-aws.sh) — **v1 전용**, v2 비권장

## 🔧 시스템 요구사항

### 로컬 개발
- Docker Desktop (Windows/Mac) 또는 Docker Engine (Linux)
- 최소 4GB RAM
- 10GB 디스크 공간

### AWS 프로덕션
- EC2 인스턴스: t2.small 이상 (2 vCPU, 2GB RAM)
- Ubuntu 22.04 LTS 또는 24.04 LTS
- 최소 20GB EBS 스토리지
- Elastic IP (고정 IP)
- 보안 그룹 설정: 포트 22(SSH), 80(HTTP), 443(HTTPS)

## 🔑 API 엔드포인트

### 인증 (Authentication)
- `POST /api/auth/register` - 회원가입
- `POST /api/auth/login` - 로그인
- `GET /api/auth/me` - 현재 사용자 정보
- `POST /api/auth/change-password` - 비밀번호 변경

### 사용자 (Users)
- `GET /api/users` - 사용자 검색
- `GET /api/users/:id` - 사용자 프로필 조회
- `PUT /api/users/profile` - 프로필 업데이트
- `GET /api/users/graduate-profile/:userId` - 졸업생 프로필 조회
- `PUT /api/users/graduate-profile` - 졸업생 프로필 업데이트

### 채용 (Jobs)
- `GET /api/jobs` - 채용 공고 목록
- `GET /api/jobs/:id` - 채용 공고 상세
- `POST /api/jobs` - 채용 공고 등록 (기업만)
- `PUT /api/jobs/:id` - 채용 공고 수정
- `DELETE /api/jobs/:id` - 채용 공고 삭제
- `POST /api/jobs/:id/apply` - 지원하기
- `GET /api/jobs/my/applications` - 내 지원 내역

### 네트워킹 (Networking)
- `GET /api/networking/connections` - 내 연결 목록
- `GET /api/networking/requests` - 연결 요청 목록
- `POST /api/networking/connect/:userId` - 연결 요청
- `PUT /api/networking/requests/:id` - 요청 수락/거절
- `GET /api/networking/mentors` - 멘토 목록
- `POST /api/networking/mentorship/:mentorId` - 멘토링 요청
- `GET /api/networking/my-mentorships` - 내 멘토링

### 상담 (Counseling)
- `GET /api/counseling` - 상담 세션 목록
- `POST /api/counseling` - 상담 예약
- `PUT /api/counseling/:id` - 상담 정보 수정
- `DELETE /api/counseling/:id` - 상담 취소
- `GET /api/counseling/available-slots` - 가능한 시간대

### 증명서 (Certificates)
- `GET /api/certificates` - 내 증명서 목록
- `POST /api/certificates` - 증명서 발급 요청
- `GET /api/certificates/:id` - 증명서 상세

### 게시글 (Posts)
- `GET /api/posts` - 게시글 목록
- `GET /api/posts/:id` - 게시글 상세
- `POST /api/posts` - 게시글 작성
- `PUT /api/posts/:id` - 게시글 수정
- `DELETE /api/posts/:id` - 게시글 삭제
- `GET /api/posts/:id/comments` - 댓글 목록
- `POST /api/posts/:id/comments` - 댓글 작성
- `POST /api/posts/:id/like` - 좋아요

## 👥 테스트 계정

프로젝트에서 다음 계정으로 테스트할 수 있습니다:

| 유형 | 이메일 | 비밀번호 | 설명 |
|------|--------|----------|------|
| 학생 | ab@ab.com | ab | 일반 학생 계정 |
| 교사 | tt@tt.com | tt | 상담 교사 계정 |
| 기업 | company@company.com | company | 기업 채용 담당자 |
| 관리자 | ad@ad.com | ad | 시스템 관리자 |

## 📊 데이터베이스 스키마

주요 테이블:
- **users** - 사용자 정보 (졸업생, 재학생, 교사, 기업, 관리자)
- **graduate_profiles** - 졸업생 상세 프로필
- **company_profiles** - 기업 프로필
- **jobs** - 채용 공고
- **job_applications** - 지원 내역
- **connections** - 네트워킹 연결
- **mentorships** - 멘토링 관계
- **counseling_sessions** - 상담 예약
- **certificates** - 증명서
- **posts** - 게시글
- **comments** - 댓글
- **notifications** - 알림

## 🔧 환경 변수 설정

`.env` 파일에 다음 변수들을 설정하세요:

```env
# 서버 설정
NODE_ENV=development
PORT=5000

# 데이터베이스 설정
DB_HOST=localhost
DB_PORT=5432
DB_NAME=graduate_network
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# JWT 설정
JWT_SECRET=your_secret_key_here_change_in_production
JWT_EXPIRE=7d

# CORS 설정
CORS_ORIGIN=http://localhost:3000
```

## 🐛 문제 해결

### 데이터베이스 연결 오류
```
Error: connect ECONNREFUSED
```
- PostgreSQL이 실행 중인지 확인
- `.env` 파일의 데이터베이스 설정 확인
- Windows: Services에서 PostgreSQL 서비스 시작

### 포트 충돌
```
Error: listen EADDRINUSE :::5000
```
- macOS AirPlay Receiver가 5000을 쓰는 경우가 많음
- 백엔드: `PORT=5050 npm start` (production compose 포트는 그대로 5000)
- 프론트: 브라우저 콘솔에서 `localStorage.setItem('jjobb_api_base','http://localhost:5050/api')` 후 새로고침
- 자세한 STATUS/로컬 DX 메모 참고

### Persona smoke
- CI: `npm test` → `backend/tests/persona-smoke.test.js` 포함
- 선택 브라우저: `npm run test:e2e` — [docs/qa/e2e-persona-smoke.md](docs/qa/e2e-persona-smoke.md)

## 📝 개발 참고사항

### API 요청 예시

```javascript
// 로그인
fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'kim.mingyu@example.com',
    password: 'password123'
  })
})
.then(res => res.json())
.then(data => {
  // data.token을 localStorage에 저장
  localStorage.setItem('token', data.token);
});

// 인증이 필요한 API 호출
fetch('http://localhost:5000/api/users/profile', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
})
.then(res => res.json())
.then(data => console.log(data));
```

## 📞 지원

문제가 발생하거나 질문이 있으시면 이슈를 등록해주세요.

## 📄 라이선스

MIT License
