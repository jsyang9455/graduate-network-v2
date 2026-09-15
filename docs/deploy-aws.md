# jjobb_v2 — AWS EC2 + Docker Compose 실행·테스트 체크리스트

전북 졸업생 취업지원플랫폼 **v2**를 EC2(Ubuntu)에서 Docker Compose로 기동·검증하는 순서이다.

### 배포 대상 (필수)

- **v2는 새로 프로비저닝한 전용 EC2**에서만 기동한다. **기존 v1 운영 서버에 올리지 말 것.**
- v1과 **DB·볼륨·호스트 포트(80/5000/5432 등)를 공유하지 않는다.** 별도 인스턴스·별도 Compose·별도 `.env`.
- 이 문서의 `docker compose down -v`는 **이 v2 인스턴스의 볼륨만** 지운다. v1 데이터에는 영향 없음.
- Postgres 기동 실패는 **첫 부팅/init·healthcheck·디스크·메모리·`.env`** 쪽을 본다. v1과의 포트·볼륨 충돌로 가정하지 말 것(분리 전제).

| 문서 | 용도 |
|------|------|
| **이 문서** (`docs/deploy-aws.md`) | **v2** — 저장소 `graduate-network-v2` · **신규 EC2 전용** |
| [`AWS-DEPLOYMENT.md`](../AWS-DEPLOYMENT.md), [`deploy-aws.sh`](../deploy-aws.sh) | **v1 지향** — `graduate-network` + 태그 `v1.1`. v2 테스트·이 서버에 쓰지 말 것 |

관련: 루트 [`.env.example`](../.env.example), [`docker-compose.yml`](../docker-compose.yml), REQ-NFR-010.

---

## 1. 사전 준비

- AWS 계정, 키 페어(`.pem`)
- 보안 그룹 인바운드: **22**(SSH), **80**(HTTP), (선택) **443**(HTTPS)
  - 브라우저 API는 **같은 호스트의 `/api`** (Nginx → backend). **5000을 SG에 열 필요 없음** (SSH·로컬 디버그용).
- Elastic IP 권장(재기동 후 IP 고정)

---

## 2. EC2 인스턴스 (Ubuntu) — v2 전용 신규

**v1 운영 호스트가 아닌 새 인스턴스**를 만든다. 동일 머신에서 v1·v2를 병행하지 않는다.

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
DB_NAME=graduate_network
JWT_SECRET=<긴랜덤문자열>
JWT_EXPIRE=7d
```

- Compose `postgres` 서비스는 같은 값으로 `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`를 설정한다(최초 볼륨 생성 시에만 적용).
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
curl -s http://127.0.0.1/api/health    # Nginx 프록시 (브라우저와 동일)
curl -s http://127.0.0.1:5000/api/health   # 백엔드 직접 (선택)
curl -sI http://127.0.0.1/
```

`/api/health`가 **502**이면 백엔드 컨테이너가 죽었거나 DB 연결 실패다. `docker compose ps`, `docker compose logs backend --tail=100`을 본다.

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

완전 초기화(데이터 삭제) — **이 v2 EC2의 Compose 볼륨만** 삭제. v1과 무관:

```bash
docker compose down -v
docker compose up -d --build
docker compose run --rm -v "$(pwd)/database:/database:ro" backend npm run migrate
```

---

## 8. 테스트 계정 참고

- Compose 기본 시드: `database/seed.sql` (데모 졸업생 등).
- DX용 페르소나 계정 목록·비밀번호: **[`TEST-ACCOUNTS.md`](../TEST-ACCOUNTS.md)** (개발 DB 전용).
- Compose init에는 **`seed.sql`만** (`student@jjob.com` 등 DX 계정 **없음**). dev/test EC2에서 DX 로그인이 필요하면:

```bash
chmod +x scripts/load-test-accounts.sh
./scripts/load-test-accounts.sh
```

(동일: `docker compose exec -T postgres psql -U postgres -d graduate_network < database/test-accounts.sql`)

- init 시드만 쓸 때는 `choi.seungmin@example.com` / `password123` (student) 등 **`seed.sql` 계정**으로 로그인 가능.

**프로덕션·공개 EC2에 테스트 계정/약한 비밀번호 시드를 남기지 말 것** (`docs/08-test-strategy.md`).

공개 가입 기업은 기본 `pending` → 공고 CRUD는 승인 후 (`REQ-JOB-007`). 시드 DX 기업(`company@jjob.com`)은 승인 상태로 맞춰 둔다.

---

## 9. 브라우저 접속

```
http://<EC2공인IP>/
http://<EC2공인IP>/login.html
```

- UI: 포트 **80** (프론트 Nginx, `nginx.conf`가 `/api/` → backend:5000 프록시)
- API: **`/api`** (공인 IP·도메인 동일, `js/api.js`)

도메인·Let's Encrypt는 선택. Compose 프론트가 이미 80을 쓰므로 **호스트에 별도 Nginx를 또 올리면 포트 충돌**에 주의한다. 1차 검증은 Elastic IP + HTTP로 충분하다.

---

## 10. 자주 막히는 지점

1. **JWT_SECRET 없음** → compose 기동 실패. 루트 `.env` 확인.
2. **v1 `deploy-aws.sh` / `AWS-DEPLOYMENT.md`** → 잘못된 저장소·`DB_HOST=db`·루트 `.env` 미반영.  
   v2 서비스명은 **`postgres`**(컨테이너명만 `graduate-network-db`). `depends_on`/`DB_HOST`에 `db`를 쓰지 말 것.
3. **마이그레이션 누락** → init은 010까지. 이력서·기업승인·정책 테이블이 없으면 §7 migrate.
4. **`/api/health` 502** → 백엔드 미기동·DB 오류. `docker compose logs backend`. (구버전 `js/api.js`는 공인 IP에서 `:5000`을 썼음 — `git pull` 후 프론트 재빌드.)
5. **`student@jjob.com` 로그인 실패** → DX 계정 미적재. §8 `./scripts/load-test-accounts.sh` 또는 seed 계정 사용.
6. **구버전 프론트 캐시** → 강력 새로고침. 로컬 API 포트 변경 시만 `localStorage.jjobb_api_base` 사용.
7. **기업 미승인** → 신규 기업 공고 403 `COMPANY_NOT_APPROVED`. 학교관리자 승인 후 재시험.
8. **보안 그룹 80 미개방** → 브라우저 타임아웃.
9. **워크넷·알림톡** → 게이트 전까지 실연동 없음(`NOT_CONFIGURED`). 가짜 키로 완성하지 말 것.
10. **타교 데이터 403/빈 목록** → `school_id` 테넌시 정상 동작에 가깝다.
11. **`dependency postgres failed to start` / `graduate-network-db` unhealthy** → 아래 [§10.1](#101-postgres-기동-실패-진단).

### 10.1 Postgres 기동 실패 진단

백엔드가 `depends_on: postgres: condition: service_healthy`라서, DB가 healthy가 아니면  
`dependency failed to start` / `container graduate-network-db …` 형태로 보인다.

**전제:** v2 전용 신규 EC2이므로 **v1과의 DB/포트 충돌이 원인인 경우는 거의 없다.**  
우선 **첫 부팅 init·healthcheck·디스크·메모리·`.env`**를 본다.

**원인 가능성 (높은 순)**

| 순위 | 원인 | 증상 |
|------|------|------|
| 1 | 첫 기동 init(schema+seed+010) 중 healthcheck 실패 / 손상된 `postgres_data` | `Exited` 또는 `unhealthy`, 로그에 init/SQL/`PANIC` |
| 2 | EC2 디스크 부족 | `No space left on device`, `df -h` 루트 거의 100% |
| 3 | 메모리 부족(t2.micro 등) | OOM / 컨테이너 즉시 종료, `dmesg`에 kill |
| 4 | `.env`의 `DB_PASSWORD`와 **기존 볼륨** 불일치 | Postgres는 떠도 백엔드 auth 실패(기동 실패와는 별개). `POSTGRES_*`는 **최초 볼륨 생성 시에만** 적용 |
| 5 | init SQL 파일 누락/깨진 마운트 | 로그에 init 스크립트 오류, `database/*.sql` 경로 확인 |
| 6 | 호스트 **5432** 이미 사용(드묾·이 전용 인스턴스에 다른 서비스가 있을 때만) | `bind: address already in use` |

**EC2에서 바로 실행**

```bash
cd ~/graduate-network-v2   # 클론 경로에 맞게

docker compose ps -a
docker compose logs postgres --tail=200
docker inspect graduate-network-db --format '{{.State.Status}} {{.State.Health.Status}} {{.State.Error}}'

df -h
free -h
sudo ss -lptn 'sport = :5432' || sudo lsof -i :5432

# 볼륨·이미지 상태
docker volume ls | grep postgres
docker compose config | head -80
```

로그에서 `initdb`, `ERROR:`, `FATAL`, `No space`, `Permission denied`, `Address already in use`를 찾는다.

**복구 (데이터 삭제 허용 시 — `down -v`는 DB 전부 삭제)**

```bash
# 1) 디스크 확보 후
docker system df
# 필요 시: docker builder prune -f   # 이미지만 정리, 볼륨은 유지

# 2) 포트 충돌이면 호스트 Postgres 중지 또는 compose ports 변경

# 3) 손상 볼륨/실패한 첫 init → 볼륨 삭제 후 재기동
docker compose down
# ⚠️ 아래는 postgres_data·업로드 볼륨 삭제. 백업 없으면 실행하지 말 것.
docker compose down -v
cp -n .env.example .env   # 없을 때만
# .env: JWT_SECRET 필수, DB_PASSWORD는 앞으로 쓸 값으로 통일
docker compose up -d --build
docker compose ps
docker compose logs postgres --tail=100

# 4) 011+ 마이그레이션
docker compose run --rm \
  -v "$(pwd)/database:/database:ro" \
  backend npm run migrate
```

**복구 (데이터 유지)** — 볼륨을 지우지 않고, 로그만으로 원인 제거(디스크 확보·5432 해제·`git pull` 후 compose 재기동).  
비밀번호만 바꾼 경우 기존 볼륨의 슈퍼유저 비밀번호는 자동 변경되지 않는다.

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
