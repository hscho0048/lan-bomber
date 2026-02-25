# LAN Bomber

같은 와이파이에서 즐기는 봄버맨 스타일 멀티플레이어 게임. 최대 6인 플레이.

## 스크린샷

> Electron 앱 또는 브라우저에서 실행

---

## 특징

- **최대 6인 동시 플레이** — 같은 LAN에서 브라우저만으로 참가 가능
- **Electron 데스크탑 앱** — 호스트는 서버 설치 없이 앱에서 바로 방 생성
- **여러 방 동시 호스팅** — 포트별로 독립적인 게임 방 운영 가능
- **LAN 자동 탐색** — UDP 브로드캐스트로 같은 네트워크의 방을 자동 검색
- **아이템 시스템** — 풍선 수/폭발 범위/속도/바늘 아이템
- **FFA / TEAM 3v3 모드**
- **게임 시간 설정** — 30초 ~ 5분

---

## 요구사항

- Node.js 18+ (권장 20+)
- npm 9+

---

## 설치

```bash
npm install
```

---

## 실행

### 브라우저 모드 (서버 직접 실행)

```bash
npm run dev:server
```

서버가 다음을 동시에 제공합니다:

- 웹 앱: `http://<HOST_LAN_IP>:8080`
- WebSocket 게임 서버: `ws://<HOST_LAN_IP>:8080`

다른 PC에서 브라우저로 `http://<HOST_LAN_IP>:8080` 접속 → 닉네임 입력 → Join.

### Electron 앱 모드

```bash
npm --prefix client run electron   # 또는 패키징된 앱 실행
```

앱 내에서 방 이름/포트를 입력하고 **방 만들기**를 누르면 서버가 자동으로 시작됩니다.

---

## 기본 포트

| 용도 | 포트 |
|---|---|
| HTTP + WebSocket | 8080 |
| UDP 탐색 (announce) | 41234 |

방화벽에서 위 포트를 허용해야 다른 PC에서 접속 가능합니다.

---

## 개발 스크립트

```bash
npm run dev:server   # shared + client 빌드 후 서버 실행
npm run dev:client   # client만 watch 빌드
npm run typecheck    # 전체 타입 체크
```

### 서버 옵션

```bash
npm --prefix server run dev -- --port 8080 --room "내 방" --udpPort 41234
npm --prefix server run dev -- --no-udp   # UDP 탐색 비활성화
```

---

## 프로젝트 구조

```
lan-bomber/
├── shared/      # 프로토콜 타입, 상수, 스키마, 맵 정의
├── server/      # 권위 서버 (게임 시뮬레이션 + HTTP + WebSocket)
├── client/      # Electron 메인 + 브라우저 렌더러 (Canvas)
└── assests/     # 캐릭터/아이템/이펙트 SVG 이미지, CSS 애니메이션
```

---

## 조작법

| 키 | 동작 |
|---|---|
| 방향키 / WASD | 이동 |
| Space | 풍선(폭탄) 설치 |
| Z / X / C | 바늘 슬롯 1/2/3 사용 |

---

## 문제 해결

- 접속이 안 될 때: 방화벽에서 TCP 8080 / UDP 41234 허용 확인
- UDP 탐색이 안 될 때: AP 격리(AP Isolation) 비활성화 확인, 또는 IP 직접 입력으로 접속
- 같은 포트에 방을 두 개 만들 수 없음 — 포트 번호를 다르게 설정

---

## 라이선스

MIT License — 자세한 내용은 [`LICENSE`](./LICENSE) 참고.

서드파티 라이브러리 라이선스는 [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES) 참고.

---

## 에셋 저작권 고지

`assests/images/` 및 `assests/action/` 폴더의 SVG 이미지(캐릭터, 아이템, 폭발 이펙트, 풍선)는
**Google Gemini**로 생성한 AI 생성 이미지입니다.
