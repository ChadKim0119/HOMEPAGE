# 여백 — 문장과 공간 사이

약 20자의 캘리그라피 문장을 중심으로 구성한 20가지 랜딩페이지 시안입니다. Vite와 바닐라 JavaScript로 구현했으며, 서버나 인증 키가 필요하지 않습니다. 한글 손글씨 폰트는 패키지에 포함되어 외부 폰트 서비스 없이 제공됩니다.

## 실행

Node.js 22.12 이상 또는 24를 사용합니다. 클라우드 환경에서는 기존 `/workspace/HOMEPAGE` 체크아웃을 사용합니다.

```sh
cd /workspace/HOMEPAGE
npm --cache /workspace/.cache/npm ci --no-audit --no-fund
npm run dev -- --port 5173
```

```sh
npm run build
npm run preview -- --port 4173
```

## 사용

- 스크롤, 터치 스와이프, 오른쪽 페이지 인디케이터, 하단 화살표로 시안을 넘깁니다.
- 키보드 ↑/↓, Page Up/Down, Home/End로 이동합니다. Escape로 열린 창을 닫습니다.
- ‘시안 모아보기’에서 배경별 필터와 저장한 시안을 확인합니다.
- ‘마음에 담기’는 현재 브라우저의 localStorage에 시안 번호만 저장합니다.
- ‘스튜디오 소개’와 ‘함께 쓰기’는 mock 콘텐츠입니다. 문의 미리보기는 전송하거나 저장하지 않습니다.
- 시스템의 동작 줄이기 설정에서는 모션 효과를 끕니다.

## 실제 작품 교체

`src/scenes.js`에서 시안별 `lines`를 변경합니다. `public/artworks/`에 작품을 추가하고 해당 시안에 `artwork: '/artworks/작품명.png'`를 지정하면 텍스트 대신 이미지를 표시합니다. 배경, 색상, 레이아웃, 마우스 효과는 유지됩니다. 이미지의 대체 텍스트로 쓰이는 `lines`도 실제 작품의 문구로 바꿉니다.

각 시안은 `#scene-01`부터 `#scene-20`까지 해시 주소로 직접 열 수 있습니다.

## 공개 배포: GitHub Pages

`.github/workflows/deploy-pages.yml`은 `main`에 push할 때 정적 파일을 빌드하고 GitHub Pages로 배포합니다. GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 한 번 선택해야 합니다. Pages 사용 가능 여부는 저장소 공개 설정과 계정 요금제에 따릅니다.

설정 후 **Actions → Deploy to GitHub Pages → Run workflow**를 실행하거나 `main`에 새 커밋을 push합니다. 성공한 배포의 `github-pages` 환경에서 실제 공개 주소를 확인합니다. 기본 배포 대상 경로는 `https://chadkim0119.github.io/HOMEPAGE/`이며, 배포 성공 및 접속 확인 전에는 활성 주소로 간주하지 않습니다.

Vite의 상대 경로 설정으로 `/HOMEPAGE/`에서도 JavaScript, CSS, 손글씨 폰트, favicon을 로드합니다. 실제 작품의 `/artworks/…` 경로도 배포 기준 경로에 맞춰 처리합니다.
