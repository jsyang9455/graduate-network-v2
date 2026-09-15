# jjobb_v2 — AWS EC2 + Docker Compose 실행·테스트 체크리스트

전북 졸업생 취업지원플랫폼 **v2**를 EC2(Ubuntu)에서 Docker Compose로 기동·검증하는 순서이다.

| 문서 | 용도 |
|------|------|
| **이 문서** (`docs/deploy-aws.md`) | **v2** — 저장소 `graduate-network-v2` |
| [`AWS-DEPLOYMENT.md`](../AWS-DEPLOYMENT.md), [`deploy-aws.sh`](../deploy-aws.sh) | **v1 지향** — `graduate-network` + 태그 `v1.1`. v2 테스트에 쓰지 말 것 |

관련: 루트 [`.env.example`](../.env.example), [`docker-compose.yml`](../docker-compose.yml), REQ-NFR-010.

---

## 1. 사전 준비

- AWS 계정, 키 페어(`.pem`)
- 보안 그룹 인바운드: **22**(SSH), **80**(HTTP), (선택) **443**(HTTPS)
  - 공인 **IP로** 접속하면 프론트가 API를 `http://<IP>:5000/api`로 호출한다 (`js/api.js`). 브라우저 검증 시 **5000**도 인바운드에 열거나, 아래 [함정](#10-자주-막히는-지점)의 `/api` 오버라이드를 쓴다.
  - 도메인(비-IP)으로 접속하면 `/api` 프록시만으로 충분해 5000 외부 개방이 불필요하다.
- Elastic IP 권장(재기동 후 IP 고정)

---

## 2. EC2 인스턴스 (Ubuntu)

| 항목 | 권장 |
|------|------|
| OS | Ubuntu **22.04** 또는 **24.04** LTS |
| 타입 | 최소 **t2.small**(2GB) / 권장 **t2.medium**(4GB) |
| 디스크 | 최소 **20GB** gp3 |

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<EC2공인IP>
```

---

## 3. Docker / Compose 설치

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release git

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker

docker --version
docker compose version
```

---

## 4. 저장소 클론 (v2만)

```bash
cd ~
git clone https://github.com/jsyang9455/graduate-network-v2.git
cd graduate-network-v2
```

- **금지:** README의 v1 `deploy-aws.sh`(graduate-network / v1.1) 자동 설치
- private면 SSH 또는 토큰으로 클론

---

## 5. 루트 `.env` (JWT_SECRET 필수)

Compose는 `${JWT_SECRET:?…}`를 사용한다. **미설정 시 `docker compose up` 실패** (REQ-NFR-010).

```bash
cp .env.example .env
# JWT_SECRET·DB_PASSWORD를 강한 값으로 설정 (예: openssl rand -base64 48)
nano .env
```

`.env.example` 기준 항목:

```env
DB_USER=postgres
DB_PASSWORD=<강한비밀번호>
JWT_SECRET=<긴랜덤문자열>
JWT_EXPIRE=7d
```

- Compose가 이미 `DB_HOST=postgres`, 백엔드 `PORT=5000`, `STORAGE_DRIVER=local`을 넣는다.
- **`.env`는 커밋하지 않는다.** 실비밀번호·실 JWT를 이 문서나 git에 넣지 말 것.
- S3는 선택(기본 로컬 볼륨 `backend_uploads`).

---

## 6. Docker Compose 기동

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=80
```

기대 컨테이너명:

- `graduate-network-frontend` (호스트 **80**)
- `graduate-network-backend` (호스트 **5000**)
- `graduate-network-db` (호스트 **5432**)

헬스:

```bash
curl -s http://127.0.0.1:5000/api/health
curl -sI http://127.0.0.1/
```

---

## 7. 마이그레이션 (011+ 필수)

첫 볼륨 생성 시 Postgres init에만 올라가는 것 (`docker-compose.yml`):

- `database/schema.sql`
- `database/seed.sql`
- **`010_v2_multischool.sql`까지**

**011~019** 등 나머지 SQL은 별도 적용이 필요하다. 백엔드 이미지에 `database/`가 없으므로 **호스트 `database`를 `/database`에 마운트**한 뒤 migrate한다.

```bash
docker compose run --rm \
  -v "$(pwd)/database:/database:ro" \
  backend npm run migrate
```

(대안: EC2에 Node가 있으면 `backend`에서 `DB_HOST=127.0.0.1` + `.env`의 DB 비밀번호로 `npm run migrate`.)

완전 초기화(데이터 삭제):

```bash
docker compose down -v
docker compose up -d --build
docker compose run --rm -v "$(pwd)/database:/database:ro" backend npm run migrate
```

---

## 8. 테스트 계정 참고

- Compose 기본 시드: `database/seed.sql` (데모 졸업생 등).
- DX용 페르소나 계정 목록·비밀번호: **[`TEST-ACCOUNTS.md`](../TEST-ACCOUNTS.md)** (개발 DB 전용).
- 시드에 DX 계정이 없으면(선택):

```bash
docker compose exec -T postgres \
  psql -U postgres -d graduate_network < database/test-accounts.sql
```

**프로덕션·공개 EC2에 테스트 계정/약한 비밀번호 시드를 남기지 말 것** (`docs/08-test-strategy.md`).

공개 가입 기업은 기본 `pending` → 공고 CRUD는 승인 후 (`REQ-JOB-007`). 시드 DX 기업(`company@jjob.com`)은 승인 상태로 맞춰 둔다.

---

## 9. 브라우저 접속

```
http://<EC2공인IP>/
http://<EC2공인IP>/login.html
```

- UI: 포트 **80** (프론트 Nginx, `nginx.conf`가 `/api/` → backend:5000 프록시)
- 공인 IP 접속 시 API 기본값은 **`:5000`** (보안 그룹 또는 아래 오버라이드 필요)
- 도메인 접속 시 기본값은 **`/api`** (프록시만으로 동작)

도메인·Let's Encrypt는 선택. Compose 프론트가 이미 80을 쓰므로 **호스트에 별도 Nginx를 또 올리면 포트 충돌**에 주의한다. 1차 검증은 Elastic IP + HTTP로 충분하다.

---

## 10. 자주 막히는 지점

1. **JWT_SECRET 없음** → compose 기동 실패. 루트 `.env` 확인.
2. **v1 `deploy-aws.sh` / `AWS-DEPLOYMENT.md`** → 잘못된 저장소·`DB_HOST=db`·루트 `.env` 미반영.
3. **마이그레이션 누락** → init은 010까지. 이력서·기업승인·정책 테이블이 없으면 §7 migrate.
4. **공인 IP + 5000 미개방** → 로그인/API 실패. SG에 5000 추가, 또는 브라우저 콘솔에서  
   `localStorage.setItem('jjobb_api_base','/api')` 후 새로고침.
5. **기업 미승인** → 신규 기업 공고 403 `COMPANY_NOT_APPROVED`. 학교관리자 승인 후 재시험.
6. **보안 그룹 80 미개방** → 브라우저 타임아웃.
7. **워크넷·알림톡** → 게이트 전까지 실연동 없음(`NOT_CONFIGURED`). 가짜 키로 완성하지 말 것.
8. **타교 데이터 403/빈 목록** → `school_id` 테넌시 정상 동작에 가깝다.

---

## 일상 운영

```bash
cd ~/graduate-network-v2
docker compose logs -f backend
docker compose restart
docker compose down                    # 볼륨 유지 중지
git pull origin main
docker compose up -d --build
docker compose run --rm -v "$(pwd)/database:/database:ro" backend npm run migrate

# 백업 예 (파일은 서버에만 보관, 시크릿과 함께 커밋 금지)
docker compose exec -T postgres \
  pg_dump -U postgres graduate_network > ~/backup_$(date +%Y%m%d).sql
```

---

## 관련 문서

- [`docs/STATUS.md`](STATUS.md) — Phase·게이트
- [`docs/02-architecture.md`](02-architecture.md) — 스택·가드
- [`DOCKER.md`](../DOCKER.md) — 로컬 Compose 참고(구식 `docker-compose` 표기 혼재 가능)
