# LAN Bomber

같은 와이파이에서 즐기는 봄버맨 스타일 멀티플레이어 게임. 최대 6인 플레이.

> Electron 앱 또는 브라우저에서 실행

---

## 특징

- **최대 6인 동시 플레이** — 같은 LAN에서 브라우저만으로 참가 가능
- **Electron 데스크탑 앱** — 호스트는 서버 설치 없이 앱에서 바로 방 생성
- **여러 방 동시 호스팅** — 포트별로 독립적인 게임 방 운영 가능
- **LAN 자동 탐색** — UDP 브로드캐스트로 같은 네트워크의 방을 자동 검색
- **캐릭터 스킨 선택** — 6가지 기본 색상 스킨 (방 전체에 공유됨)
- **아이템 시스템** — 풍선 수 / 폭발 범위 / 속도 / 바늘 아이템
- **FFA / TEAM 3v3 모드**
- **게임 시간 설정** — 30초 ~ 5분 (타임아웃 시 무승부)
- **5가지 맵** — 다양한 크기와 레이아웃

---

## 요구사항

- Node.js 18+ (권장 20+)
- npm 9+

---

## 빠른 시작 (Windows)

**`launch.bat`을 더블클릭**하면 모든 과정이 자동으로 진행됩니다.

1. 포트 번호 입력 (기본값 3000)
2. 방 이름 입력
3. 패키지 설치 → 빌드 → 서버 시작 → 브라우저 자동 오픈

> 방을 여러 개 열고 싶으면 `launch.bat`을 여러 번 실행하고 포트만 다르게 입력하면 됩니다.

**참가자(게스트)는 별도 설치 없이** 호스트가 알려주는 주소를 브라우저에 입력하면 됩니다:
```
http://<호스트 LAN IP>:3000
```

---

## 설치 (수동)

```bash
npm install
```

---

## 실행 (수동)

### 브라우저 모드 (서버 직접 실행)

```bash
npm run dev:server
```

서버가 다음을 동시에 제공합니다:

- 웹 앱: `http://<HOST_LAN_IP>:3000`
- WebSocket 게임 서버: `ws://<HOST_LAN_IP>:3000`

다른 PC에서 브라우저로 `http://<HOST_LAN_IP>:3000` 접속 → 닉네임 입력 → Join.

### Electron 앱 모드

```bash
npm --prefix client run electron
```

앱 내에서 방 이름/포트를 입력하고 **방 만들기**를 누르면 서버가 자동으로 시작됩니다.

---

## 기본 포트

| 용도 | 포트 |
|---|---|
| HTTP + WebSocket | 3000 |
| UDP 탐색 (announce) | 41234 |

방화벽에서 위 포트를 허용해야 다른 PC에서 접속 가능합니다.

---

## 여러 방 운영 (다중 포트)

포트를 다르게 지정하면 같은 PC에서 독립적인 게임 방을 여러 개 운영할 수 있습니다.

```bash
# 터미널 1
npm --prefix server run dev -- --port 3000 --room "방 A"

# 터미널 2
npm --prefix server run dev -- --port 3001 --room "방 B"
```

각 방은 완전히 독립적으로 동작하며, UDP 탐색을 통해 클라이언트에 자동으로 표시됩니다.

---

## 개발 스크립트

```bash
npm run dev:server    # shared + client 빌드 후 서버 실행 (watch)
npm run dev:client    # client만 watch 빌드
npm run build:shared  # shared 패키지 단독 빌드
npm run build:server  # server 단독 빌드
npm run build:client  # client 단독 빌드
npm run typecheck     # 전체 타입 체크
```

---

## 서버 옵션

| 옵션 | 환경변수 | 기본값 | 설명 |
|---|---|---|---|
| `--port <n>` | `WS_PORT` | `3000` | HTTP + WebSocket 포트 |
| `--room <name>` | `ROOM_NAME` | `LAN Bomber Room` | 방 이름 |
| `--udpPort <n>` | `UDP_PORT` | `41234` | UDP 탐색 포트 |
| `--no-udp` | — | — | UDP 탐색 비활성화 |
| `--log <level>` | `LOG_LEVEL` | `info` | 로그 레벨 (debug / info / warn / error) |

```bash
# 예시: 포트 변경 + 방 이름 설정
npm --prefix server run dev -- --port 3001 --room "우리방"

# 예시: UDP 탐색 없이 실행
npm --prefix server run dev -- --no-udp

# 예시: 환경변수로 설정
WS_PORT=3001 ROOM_NAME="우리방" npm --prefix server run start
```

---

## 프로젝트 구조

```
lan-bomber/
├── shared/      # 프로토콜 타입, 상수, 스키마, 맵 정의
├── server/      # 권위 서버 (게임 시뮬레이션 + HTTP + WebSocket)
├── client/      # Electron 메인 + 브라우저 렌더러 (Canvas)
└── assests/     # 캐릭터/아이템/이펙트 SVG 이미지
```

---

## 조작법

| 키 | 동작 |
|---|---|
| 방향키 / WASD | 이동 |
| Space | 풍선(폭탄) 설치 (이동 중에도 가능) |
| Z / X / C | 바늘 슬롯 1/2/3 사용 |

---

## 맵 목록

| ID | 이름 | 크기 |
|---|---|---|
| map1 | Basic | 15×13 |
| map2 | Classic | 17×13 |
| map3 | Grand Classic | 21×15 |
| map4 | Canyon | 19×15 |
| map5 | Titan Fields | 23×17 |

---

## 문제 해결

- **접속이 안 될 때**: 방화벽에서 TCP 3000 / UDP 41234 허용 확인
- **UDP 탐색이 안 될 때**: AP 격리(AP Isolation) 비활성화 확인, 또는 수동 IP 입력으로 접속
- **같은 포트에 방을 두 개 만들 수 없음**: 포트 번호를 다르게 설정

---

## 라이선스

MIT License — 자세한 내용은 [`LICENSE`](./LICENSE) 참고.

서드파티 라이브러리 라이선스는 [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES) 참고.

---

## 에셋 저작권 고지

`assests/images/` 및 `assests/action/` 폴더의 SVG 이미지(캐릭터, 아이템, 폭발 이펙트, 풍선)는
**Google Gemini**로 생성한 AI 생성 이미지입니다.
