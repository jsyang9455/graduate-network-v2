# jjobb_v2 — AWS EC2 + Docker Compose 실행 가이드 (현재판)

전북 졸업생 취업지원플랫폼 **v2**를 **신규 전용 EC2(Ubuntu)** 에서 Docker Compose로 기동·검증하는 **end-to-end** 순서이다.  
복사해 쓸 명령은 아래 §1–§12를 따른다.

### 배포 대상 (필수)

- **v2는 새로 프로비저닝한 전용 EC2**에서만 기동한다. **기존 v1 운영 서버에 올리지 말 것.**
- v1과 **DB·볼륨·호스트 포트(80/5000/5432 등)를 공유하지 않는다.** 별도 인스턴스·별도 Compose·별도 `.env`.
- 이 문서의 `docker compose down -v`는 **이 v2 인스턴스의 볼륨만** 지운다. v1 데이터에는 영향 없음.
- Postgres 기동 실패는 **첫 부팅/init·healthcheck·디스크·메모리·`.env`** 쪽을 본다. v1과의 포트·볼륨 충돌로 가정하지 말 것(분리 전제).

| 문서 | 용도 |
|------|------|
| **이 문서** (`docs/deploy-aws.md`) | **v2** — 저장소 `graduate-network-v2` · **신규 EC2 전용** |
| [`AWS-DEPLOYMENT.md`](../AWS-DEPLOYMENT.md), [`deploy-aws.sh`](../deploy-aws.sh) | **v1 지향** — `graduate-network` + 태그 `v1.1`. v2 테스트·이 서버에 쓰지 말 것 |

관련: 루트 [`.env.example`](../.env.example), [`docker-compose.yml`](../docker-compose.yml), [`nginx.conf`](../nginx.conf), [`scripts/aws-up.sh`](../scripts/aws-up.sh), [`scripts/load-test-accounts.sh`](../scripts/load-test-accounts.sh), REQ-NFR-010.

### 권장: one-shot `scripts/aws-up.sh` (clone 이후)

수동으로 `compose up` → migrate → curl을 나눠 치지 말고, **아래 스크립트를 1차 경로로 사용**한다.  
`.env`가 없거나 `JWT_SECRET`이 플레이스홀더면 `aws-up.sh`가 `scripts/init-env.sh`로 자동 채운다(수동 준비도 OK).

```bash
cd ~/graduate-network-v2
chmod +x scripts/aws-up.sh scripts/init-env.sh
./scripts/aws-up.sh
# 전용 테스트 EC2: DX 계정 기본 적재. prod만 끌 것:
#   ./scripts/aws-up.sh --no-test-accounts
#   # 또는 .env: DEPLOY_ENV=production / LOAD_TEST_ACCOUNTS=0
```

스크립트가 하는 일: `.env` 검사(또는 `init-env.sh`로 JWT_SECRET·DB_PASSWORD·**FRONTEND_PORT=8090** 생성) → **단계 기동**(`postgres` healthy → migrate → `backend` healthy → `frontend`) → `http://127.0.0.1:8090/api/health` 200까지 폴링 → **비-prod면 `load-test-accounts.sh`** → 실패 시 diagnostics → 성공 시 브라우저 URL·DX 로그인 curl 힌트.

한 번에 `compose up`하면 frontend가 backend healthy를 기다리며 **`dependency backend failed to start`** 가 날 수 있어, `aws-up.sh`는 순서를 나눈다.

§6–§8 수동 단계는 스크립트 실패 디버깅·부분 재실행용이다.

---

## 1. 사전 준비 (보안 그룹 · 전용 EC2)

- AWS 계정, 키 페어(`.pem`)
- **v1이 아닌 새 EC2** (Ubuntu 22.04/24.04 LTS 권장, 최소 t2.small / 권장 t2.medium, 디스크 ≥20GB gp3)
- 보안 그룹 인바운드: **22**(SSH, 본인 IP 권장), **8090**(기본 `FRONTEND_PORT`), (선택) **80**/443
  - **기본 프론트 호스트 포트는 8090** (호스트 nginx가 :80을 쓰는 EC2 AMI와 충돌 방지). 브라우저: `http://<IP>:8090/`
  - `FRONTEND_PORT=80`을 쓰면 호스트 :80을 비운 뒤 SG **80** 허용. §11.2b 참고.
  - 브라우저 API는 **같은 호스트의 `/api`** (Nginx → backend). **5000을 SG에 열 필요 없음**
  - 외부에서 진단할 때: **타임아웃** ≈ SG/NACL 차단, **Connection refused** ≈ SG는 통과했으나 호스트에 listen 없음(프론트 미기동·포트 미매핑)
- Elastic IP 권장(재기동 후 IP 고정). IP가 바뀌면(새 인스턴스·EIP 미연결) 브라우저/SSH 대상 IP도 갱신한다.

---

## 2. SSH 접속

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

## 4. 저장소 클론 (`graduate-network-v2`)

```bash
cd ~
git clone https://github.com/jsyang9455/graduate-network-v2.git
cd graduate-network-v2
```

- **금지:** README의 v1 `deploy-aws.sh`(graduate-network / v1.1) 자동 설치
- private면 SSH 또는 토큰으로 클론

---

## 5. 루트 `.env` (`JWT_SECRET` · `DB_PASSWORD` 필수)

Compose는 `${JWT_SECRET:?…}`를 사용한다. **미설정 시 `docker compose up` 실패** (REQ-NFR-010).

**권장 (자동):**

```bash
cd ~/graduate-network-v2
chmod +x scripts/init-env.sh
./scripts/init-env.sh
# → .env 없으면 .env.example 복사 + JWT_SECRET·DB_PASSWORD 랜덤 생성
```

**수동:**

```bash
cp .env.example .env
openssl rand -base64 48   # 출력값을 JWT_SECRET= 뒤에 붙임
nano .env
```

`.env.example` 기준 항목:

```env
DB_USER=postgres
DB_PASSWORD=<강한비밀번호>
DB_NAME=graduate_network
JWT_SECRET=<긴랜덤문자열>
JWT_EXPIRE=7d
```

- Compose `postgres`는 같은 값으로 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`를 설정한다(**최초 볼륨 생성 시에만** 적용).
- Compose가 `DB_HOST=postgres`, 백엔드 `PORT=5000`, `STORAGE_DRIVER=local`을 넣는다.
- **`.env`는 커밋하지 않는다.** 실비밀번호·실 JWT를 이 문서나 git에 넣지 말 것.
- `init-env.sh`가 `DB_PASSWORD=postgres`(예제 기본값)를 랜덤으로 바꾸면, **이미 만든 `postgres_data` 볼륨**과 불일치할 수 있다 → 기존 비번을 유지하거나 `docker compose down -v`(데이터 삭제) 후 재기동.

---

## 6. Docker Compose 기동

**권장:** §5 후 `./scripts/aws-up.sh` (기동+migrate+헬스까지). 아래는 수동/부분 재실행용.

```bash
cd ~/graduate-network-v2
docker compose up -d --build
docker compose ps
docker compose logs --tail=80
```

기대 컨테이너:

| 컨테이너명 | 역할 | 호스트 포트 |
|------------|------|-------------|
| `graduate-network-frontend` | Nginx + 정적 | **8090** (기본 `FRONTEND_PORT`) |
| `graduate-network-backend` | Express API | **5000** (SG 외부 개방 불필요) |
| `graduate-network-db` | Postgres 15 | **5432** |

서비스명은 **`postgres`**(컨테이너명만 `graduate-network-db`). `depends_on`/`DB_HOST`에 `db`를 쓰지 말 것.

Postgres는 `healthcheck` + `start_period: 90s`(첫 init: schema+seed+010) 후 백엔드가 기동한다.  
Backend는 `scripts/healthcheck.js`(node alpine에 wget 없음) + `start_period: 180s`(DB 대기·migrate-on-boot).

---

## 7. 마이그레이션 (011+ 필수)

첫 볼륨 생성 시 Postgres init에만 올라가는 것:

- `database/schema.sql` → `/docker-entrypoint-initdb.d/1-schema.sql`
- `database/seed.sql` → `2-seed.sql`
- **`010_v2_multischool.sql`** → `3-v2-multischool.sql`

**011~019** 등 나머지는 백엔드 `applyPendingMigrations` / `npm run migrate`가 적용한다. Compose `backend`는 `./database` → `/database:ro`를 마운트한다(기동 시 migrate·502 방지).

`schema.sql`이 mid-init에서 실패하면(예: 과거 `majors` `ON CONFLICT (name)` vs partial unique) 볼륨은 남고 `announcements` 등이 빠진 채 재기동된다 → migrate `013`이 `relation "announcements" does not exist`로 실패. **수정 커밋 pull 후 테스트 EC2는 볼륨 삭제 재초기화가 필요**하다.

```bash
cd ~/graduate-network-v2
# 권장: ./scripts/aws-up.sh  (migrate 포함)
docker compose run --rm \
  -v "$(pwd)/database:/database:ro" \
  backend npm run migrate
```

완전 초기화(데이터 삭제) — **이 v2 EC2의 Compose 볼륨만** (init 손상·013 실패 복구):

```bash
git pull origin main
docker compose down -v
./scripts/aws-up.sh
```

(또는 `docker compose up -d --build` 후 `backend npm run migrate` — `aws-up.sh`가 동일 순서를 자동화한다.)

---

## 8. 헬스 체크 (`/api/health` — bare `/health` 아님)

정식 경로는 **`GET /api/health`** (Express `backend/server.js` + Nginx `location /api/`).  
`aws-up.sh`가 이미 200을 확인할 때까지 폴링한다(상태 변경·약 30초마다만 출력; 성공 시 종료). 수동 재확인:

**로그 노이즈:** `docker compose logs -f backend`에 약 10초마다 `GET /api/health 200`이 보이면 Compose healthcheck + morgan 액세스 로그이며 **정상**(오류 아님). 스크립트 폴링이 멈추지 않으면 Ctrl+C로 `aws-up.sh`만 중단하면 된다(컨테이너는 계속 기동).

```bash
# EC2 호스트에서 (권장) — 기본 FRONTEND_PORT=8090
curl -sS -i http://127.0.0.1:8090/api/health
# 기대: HTTP 200 + {"status":"OK",...}

# 참고 (정식이 아님)
curl -sS -i http://127.0.0.1:8090/health          # nginx.conf 별칭 → 같은 백엔드
curl -sS -i http://127.0.0.1:5000/api/health      # 백엔드 직접(로컬만)
```

**404 vs 502**

| 응답 | 의미 | 다음 조치 |
|------|------|-----------|
| **404** on bare `/health` | 잘못된 경로(구 Nginx는 정적 root에 파일 없음) | **`/api/health`를 치세요** |
| **404** on `/api/health` | `/api/` 프록시 없음·구 프론트 이미지 | `docker compose up -d --build frontend` |
| **502** on `/api/health` | 프록시는 됨, **백엔드 미기동·크래시·DB 실패** | §11 + `docker compose logs backend` |
| `/api/v1/health` | **없음** → 404 | `/api/health` 사용 |

```bash
docker compose ps -a
docker compose logs backend --tail=120
docker compose exec frontend wget -qO- http://backend:5000/api/health
```

---

## 9. DX 테스트 계정 (`student@jjob.com`)

Compose init에는 **`seed.sql`만** 있다. `student@jjob.com` 등 DX 계정은 **없음** (`database/test-accounts.sql` 별도).
`test-accounts.sql`은 email **UPSERT**(users DELETE 없음)라 `audit_logs.actor_id` 등이 있어도 재실행 안전하다.

**전용 테스트 EC2:** `./scripts/aws-up.sh`가 **기본으로** DX 계정을 적재한다 (`DEPLOY_ENV`가 `production`/`prod`가 아니면).

```bash
cd ~/graduate-network-v2
git pull
# 이미 기동 중이면 계정만:
chmod +x scripts/load-test-accounts.sh
./scripts/load-test-accounts.sh

# 로그인 검증 (호스트에서)
curl -sS -X POST http://127.0.0.1:8090/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"student@jjob.com","password":"password123"}'
```

- DX: `student@jjob.com` / `graduate@jjob.com` / `teacher@jjob.com` / `company@jjob.com` / `admin@jjob.com` — 비밀번호 **`password123`** (`TEST-ACCOUNTS.md`)
- init 시드만: `choi.seungmin@example.com` / `password123` 등 **`seed.sql`**
- **프로덕션:** `./scripts/aws-up.sh --no-test-accounts` 또는 `.env`에 `DEPLOY_ENV=production`
- 공개 가입 기업 `pending`은 **로그인은 허용**, 공고 CRUD만 승인 후 (`REQ-JOB-007`)

---

## 10. 브라우저 접속 + 강력 새로고침

```
http://<EC2공인IP>:8090/
http://<EC2공인IP>:8090/login.html
```

- UI: 포트 **8090** (기본 `FRONTEND_PORT`; 컨테이너 내부 nginx는 80)
- API: **`/api`** — 공인 IP·도메인에서 `js/api.js`가 **`/api`**(상대 경로)를 사용. 호스트 `:5000` 개방 불필요
- 배포·프론트 갱신 후 **강력 새로고침**(캐시된 구 `api.js`가 `:5000`을 치면 실패할 수 있음)
- 로컬 오버라이드만: `localStorage.jjobb_api_base` (예: AirPlay로 5050 쓸 때)

도메인·Let's Encrypt는 선택. 기본 호스트 포트 **8090**이라 호스트 nginx(:80)와 공존 가능. `:80`에 올리려면 호스트 nginx를 끄고 `FRONTEND_PORT=80` → §11.2b.

---

## 11. 트러블슈팅

### 11.0 `error .env incomplete: set JWT_SECRET` (aws-up.sh)

`./scripts/aws-up.sh`가 바로 실패한 경우. `.env`가 없거나 `JWT_SECRET`이 비어 있거나 예제 값 `replace_with_long_random_string`인 상태다 (REQ-NFR-010).

**지금 EC2에서 고치기 (수동 nano):**

```bash
cd ~/graduate-network-v2   # 클론 경로에 맞게
cp -n .env.example .env    # 없으면 복사 (-n: 기존 .env 덮어쓰지 않음)
openssl rand -base64 48    # 출력 복사
nano .env
```

`nano`에서 아래처럼 맞춘다 (값은 본인 생성분으로):

```env
JWT_SECRET=<방금 openssl 출력 한 줄>
DB_PASSWORD=<강한비밀번호>   # 예제 postgres 대신 권장; 볼륨 이미 있으면 기존 값 유지
```

저장 후:

```bash
./scripts/aws-up.sh
```

**자동 (git pull 후 init 스크립트가 있는 경우):**

```bash
cd ~/graduate-network-v2
git pull origin main
chmod +x scripts/init-env.sh scripts/aws-up.sh
./scripts/init-env.sh      # 플레이스홀더 JWT / 빈·예제 DB 비번 채움
./scripts/aws-up.sh
```

최신 `aws-up.sh`는 이 검사가 실패하기 전에 `init-env.sh`를 호출한다. 구 커밋만 있으면 위 수동 또는 `git pull` 후 재실행.

### 11.1 Postgres failed / `dependency postgres failed to start`

백엔드가 `depends_on: postgres: condition: service_healthy`라서 DB가 healthy가 아니면 기동 실패로 보인다.

**전제:** v2 전용 신규 EC2 → **v1과의 DB/포트 충돌은 거의 없다.** 첫 부팅 init·healthcheck·디스크·메모리·`.env`를 본다.

| 순위 | 원인 | 증상 |
|------|------|------|
| 1 | 첫 기동 init 중 healthcheck / 손상된 `postgres_data` | `Exited`·`unhealthy`, init/`PANIC` |
| 2 | **init SQL abort** (`majors` ON CONFLICT / incomplete schema) | postgres 로그 `no unique or exclusion constraint matching the ON CONFLICT`; 이후 migrate `relation "announcements" does not exist` |
| 3 | 디스크 부족 | `No space left on device` |
| 4 | 메모리 부족(t2.micro 등) | OOM, `dmesg` kill |
| 5 | `.env` `DB_PASSWORD`와 **기존 볼륨** 불일치 | 백엔드 auth 실패 (`POSTGRES_*`는 최초 볼륨만) |
| 6 | init SQL 누락/깨진 마운트 | init 스크립트 오류 |
| 7 | 호스트 5432 점유(드묾) | `bind: address already in use` |

**init abort → incomplete DB 복구 (테스트 EC2, 데이터 삭제 OK):**

```bash
cd ~/graduate-network-v2
git pull origin main   # majors INSERT + 013/014 IF EXISTS 가드 포함
docker compose down -v
./scripts/aws-up.sh
```

```bash
cd ~/graduate-network-v2
docker compose ps -a
docker compose logs postgres --tail=200
docker inspect graduate-network-db --format '{{.State.Status}} {{.State.Health.Status}} {{.State.Error}}'
df -h
free -h
```

데이터 삭제 허용 시:

```bash
docker compose down -v
# .env: JWT_SECRET 필수, DB_PASSWORD 통일
docker compose up -d --build
docker compose run --rm -v "$(pwd)/database:/database:ro" backend npm run migrate
```

### 11.2 `dependency backend failed to start` / `graduate-network-backend Error`

Frontend는 `depends_on: backend: condition: service_healthy`이다. **백엔드가 healthy가 되기 전에** frontend를 같이 올리면 Compose가 이 메시지로 실패한다. (구 `aws-up.sh`가 `compose up` 한 번에 전부 기동할 때 흔함.)

| 순위 | 원인 | 로그에서 볼 것 |
|------|------|----------------|
| 1 | migrate-on-boot 실패 → `exit 1` (컨테이너 Error/restart) | `Failed to apply migrations`, `relation "announcements" does not exist`(불완전 init → §11.1), `Migrations directory not found` |
| 2 | `.env` `DB_PASSWORD` ≠ 기존 `postgres_data` 볼륨 비번 | `password authentication failed` |
| 3 | healthcheck가 listen 전에 소진 (느린 EC2 / 긴 migrate) | `unhealthy`, health 실패 반복 |
| 4 | JWT_SECRET 미설정 | compose가 backend 자체를 안 올림 |
| 5 | initdb로 010이 이미 적용됐는데 `schema_migrations`에 없음 | 구 코드는 재적용 충돌; 최신은 idempotent skip |

```bash
cd ~/graduate-network-v2
git pull origin main
./scripts/aws-up.sh
# 실패 시 스크립트가 덤프하는 줄 + 아래를 확인:
docker compose ps -a
docker inspect graduate-network-backend --format '{{.State.Status}} {{.State.Health.Status}} {{.State.Error}}'
docker compose logs backend --tail=120
```

데이터 삭제 허용(비번 불일치·손상 볼륨):

```bash
docker compose down -v
# .env DB_PASSWORD / JWT_SECRET 유지 또는 init-env.sh
./scripts/aws-up.sh
```

### 11.2b Host port in use (`failed to bind host port …`)

Frontend가 **Created**에 머물고, 로그/에러에 `address already in use` / `failed to bind host port` 이 보이면 **백엔드 문제가 아니다.** Backend·Postgres가 healthy여도 **`FRONTEND_PORT`(기본 8090)** 가 이미 점유되어 있으면 Compose가 frontend publish에 실패한다.

**확인:**

```bash
ss -lptn 'sport = :8090'   # 또는 .env의 FRONTEND_PORT
# 또는: sudo lsof -iTCP:8090 -sTCP:LISTEN
docker compose ps -a   # frontend = Created, PORTS empty, backend = healthy 이면 이 케이스
```

**옵션 A — 해당 포트 비우기 후 재기동:**

```bash
ss -lptn 'sport = :8090'
# 점유 프로세스/컨테이너 중지 후:
cd ~/graduate-network-v2
git pull origin main
./scripts/aws-up.sh
```

**옵션 B — 다른 호스트 포트 (`FRONTEND_PORT`):**

```bash
cd ~/graduate-network-v2
git pull origin main
FRONTEND_PORT=8091 ./scripts/aws-up.sh
# 브라우저: http://<EC2공인IP>:8091/
# 보안 그룹 인바운드에 8091 허용
```

`.env`에 `FRONTEND_PORT=8090`(기본)을 두면 이후에도 동일하다. Compose는 `"0.0.0.0:${FRONTEND_PORT:-8090}:80"`이다. 호스트 :80을 쓰려면 `FRONTEND_PORT=80` + 호스트 nginx 중지 + SG 80. `aws-up.sh`는 이 에러를 backend dependency로 오진하지 않는다.

> **참고:** 구 기본값(:80) 시절에는 호스트 nginx와 충돌이 흔했다. 현재 기본 **8090**이면 그 충돌은 보통 사라진다. `nginx=000`이 남으면 §11.2c.

### 11.2c `nginx=000` + `backend:5000=200` (프론트 “Started”인데 호스트 포트 무응답)

`aws-up`이 **Frontend started** 후 폴링에서 `nginx=000 backend:5000=200`만 반복하면 **백엔드 문제가 아니다.** curl 000 = 호스트에서 해당 포트로 **TCP 연결 자체가 안 됨**(Connection refused). Nginx 502/404가 아님.

흔한 원인:

| 원인 | `docker compose ps -a`에서 |
|------|---------------------------|
| 호스트 포트 점유 → publish 실패 | frontend **Created**, **PORTS 비어 있음** (§11.2b) |
| nginx 크래시 루프 (`host not found in upstream` 등) | Restarting / 로그에 emerg |
| `FRONTEND_PORT` 불일치 | 8090에 떠 있는데 curl은 :80 (구 문서/습관) |

**즉시 확인 (EC2):**

```bash
cd ~/graduate-network-v2
docker compose ps -a frontend
docker compose logs frontend --tail=50
docker port graduate-network-frontend || true
ss -lptn 'sport = :80 or :8090 or :8080'
curl -v --connect-timeout 2 http://127.0.0.1:8090/
curl -v --connect-timeout 2 http://127.0.0.1:8090/api/health
# frontend가 Up일 때만:
docker compose exec frontend wget -qO- http://backend:5000/api/health
```

**조치:** `git pull` → SG에 **TCP 8090** 허용 → `./scripts/aws-up.sh` (nginx.conf 반영을 위해 build 포함). 최신 `aws-up.sh`는 PORTS 비어 있으면 300초 대기하지 않고 바로 진단 덤프 후 실패한다. 여전히 :80을 쓰려면 호스트 nginx 중지 후 `FRONTEND_PORT=80`.

### 11.3 `/api/health` 502 · 백엔드

Nginx는 살아 있으나 upstream(`backend:5000`)이 없거나 기동 직후 크래시하면 **502**.

흔한 원인:

| 원인 | 증상 |
|------|------|
| `/database` 미마운트 → production start가 migrate 실패 후 `exit 1` | backend 재시작 루프, 로그에 Migrations directory / ENOENT |
| Postgres unhealthy / DB 비번 불일치 | backend DB connection 오류 |
| JWT_SECRET 없음 | compose 기동 실패 |
| 구 frontend 이미지(프록시 없음) | 보통 404; 재빌드 필요 |

```bash
./scripts/aws-up.sh   # 재시도 + 자동 diagnostics
docker compose logs backend --tail=120
docker compose logs postgres --tail=80
docker compose exec frontend wget -qO- http://backend:5000/api/health
```

### 11.4 API URL (공인 IP에서 `:5000`)

현재 `js/api.js`: localhost → `http://localhost:5000/api`, **공인 IP/도메인/:8090 → `/api`**.  
`localStorage.jjobb_api_base` 오버라이드는 **localhost에서만** 적용(EC2에서 오래된 `:5000` 오버라이드 무시).

구 캐시/구 커밋이 `:5000`을 쓰면 SG에서 막혀 타임아웃. `git pull` + `docker compose up -d --build` + 브라우저 강력 새로고침.

### 11.4b `/api/health` 200인데 `/api/auth/login` 404

증상: health·UI는 되는데 로그인·schools·jobs가 Express `NOT_FOUND`.

원인: `nginx.conf`에서 **변수 `proxy_pass http://$host/api/`** 를 쓰면 URI가 `/api/`로 잘린다(정확한 `=/api/health`만 정상).

조치:

```bash
git pull
./scripts/aws-up.sh          # frontend 이미지 재빌드 포함 (nginx.conf는 bake-in)
# 또는: docker compose up -d --build frontend
curl -sS -X POST http://127.0.0.1:8090/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"student@jjob.com","password":"password123"}'
```

### 11.5 DX 계정 없음 / 401 (`student@jjob.com` 로그인 실패)

증상: `/api/health` 200 + `/api/auth/login` → **401** `UNAUTHENTICATED`.

원인 후보:
1. DX 미적재 (`seed.sql`에는 `student@jjob.com` 없음)
2. **잘못된 bcrypt 해시** — 구 `database/*.sql`의 `$2b$10$rZ0HwKnI…` 는 `password123`과 **불일치** (계정은 있어도 401)

조치:

```bash
git pull
./scripts/load-test-accounts.sh   # SQL + bcrypt 재해시 + curl 검증
./scripts/verify-login.sh
# 공개 IP: BASE_URL=http://<EC2공인IP>:8090 ./scripts/verify-login.sh
```

`aws-up` 기본(비-prod)은 이미 적재·검증한다. **404**면 §11.4b (nginx), **401**이면 본 절.

### 11.6 기타

1. **JWT_SECRET 없음** → §11.0. 루트 `.env` / `./scripts/init-env.sh`.
2. **v1 `deploy-aws.sh` / `AWS-DEPLOYMENT.md`** → 잘못된 저장소·`DB_HOST=db`. v2는 서비스명 **`postgres`**.
3. **마이그레이션 누락** → init은 010까지. §7 migrate.
4. **기업 미승인** → 신규 기업 공고 403 `COMPANY_NOT_APPROVED`.
5. **보안 그룹에 FRONTEND_PORT(기본 8090) 미개방** → 브라우저 **타임아웃**. (`FRONTEND_PORT=80`이면 **80** 허용 — §1·§11.2b.)
6. **호스트 :8090/:80 Connection refused** → SG는 열린 경우가 많음. `docker compose ps`·`ss -lptn`·`.env`의 `FRONTEND_PORT` 확인. frontend Up + publish 없으면 §6/`aws-up.sh` / §11.2c.
7. **호스트 포트 점유** → frontend Created + `address already in use` → §11.2b.
8. **워크넷·알림톡** → 게이트 전 `NOT_CONFIGURED`. 가짜 키로 완성하지 말 것.
9. **타교 데이터 403/빈 목록** → `school_id` 테넌시 정상 동작에 가깝다.

---

## 12. 업데이트 / 재배포

```bash
cd ~/graduate-network-v2
git pull origin main
./scripts/aws-up.sh
# 또는 수동:
# docker compose up -d --build
# docker compose run --rm -v "$(pwd)/database:/database:ro" backend npm run migrate
# curl -sS -i http://127.0.0.1:8090/api/health
```

참고:

- `nginx.conf` 변경은 바인드 마운트만으로는 반영되지 않음 → **frontend 이미지 재빌드** 필요.
- HTML/JS/CSS는 바인드 마운트로 `git pull` 후 반영되나, 브라우저는 **강력 새로고침**.
- `docker compose down` — 볼륨 유지 중지. `down -v` — **DB·업로드 삭제**.

일상 로그·백업:

```bash
docker compose logs -f backend
docker compose exec -T postgres \
  pg_dump -U postgres graduate_network > ~/backup_$(date +%Y%m%d).sql
# 백업 파일·시크릿은 커밋 금지
```

---

## 빠른 복사 시퀀스 (신규 EC2 요약)

```bash
# 2) SSH
ssh -i your-key.pem ubuntu@<EC2공인IP>

# 3) Docker (한 번)
# … §3 설치 명령 …

# 4–10) 앱 기동 (one-shot)
cd ~
git clone https://github.com/jsyang9455/graduate-network-v2.git
cd graduate-network-v2
chmod +x scripts/init-env.sh scripts/aws-up.sh
./scripts/init-env.sh          # 또는 cp .env.example .env && nano .env
./scripts/aws-up.sh   # 비-prod면 DX 계정 기본 적재; prod: --no-test-accounts
# 브라우저: http://<EC2공인IP>:8090/login.html  (강력 새로고침 Ctrl+Shift+R)
# 검증:
# curl -sS -X POST http://127.0.0.1:8090/api/auth/login -H 'Content-Type: application/json' \
#   -d '{"email":"student@jjob.com","password":"password123"}'
```

---

## 관련 문서

- [`docs/STATUS.md`](STATUS.md) — Phase·게이트
- [`docs/02-architecture.md`](02-architecture.md) — 스택·가드
- [`TEST-ACCOUNTS.md`](../TEST-ACCOUNTS.md) — DX 페르소나 (개발 DB 전용)
- [`DOCKER.md`](../DOCKER.md) — 로컬 Compose 참고
