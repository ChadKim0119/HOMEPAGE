# 여백 — 문장과 공간 사이

참고 이미지의 NOTES ON 커버와 기존 20개 장면으로 구성한 총 21가지 랜딩페이지 시안입니다. Vite와 바닐라 JavaScript로 구현했으며 서버나 인증 키가 필요하지 않습니다. 영어가 기본이며, 한글·영문 폰트 모두 패키지에서 직접 제공합니다.

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
- 우측 `EN / KO`에서 캘리그라피 문장, 안내, 필터, 폼과 접근성 레이블을 함께 전환합니다. 언어 선택은 현재 브라우저에 저장됩니다.
- `F` 또는 전체 화면 버튼으로 몰입 모드를 켜고 끕니다. 브라우저가 지원하면 실제 전체 화면으로 전환합니다. 지원하지 않는 임베디드 브라우저에서는 가이드와 내비게이션을 숨기는 모드를 사용합니다. `Escape`로 나올 수 있으며, 입력 필드나 열린 대화상자에서는 단축키가 작동하지 않습니다.
- ‘시안 모아보기’에서 배경별 필터와 저장한 시안을 확인합니다.
- ‘마음에 담기’는 현재 브라우저의 localStorage에 시안 ID만 저장합니다. 커버 추가 전 저장한 시안도 원래 장면과 연결합니다.
- ‘스튜디오 소개’와 ‘함께 쓰기’는 mock 콘텐츠입니다. 문의 미리보기는 전송하거나 저장하지 않습니다.
- 시스템의 동작 줄이기 설정에서는 모션 효과를 끕니다.
- 먹 번짐은 Canvas의 확산하는 먹 자국, 빛은 전체 화면 포인터 추적, 종이는 3D 기울기, 패턴과 문장은 이동 효과를 사용합니다. 타이핑은 글자별로 나타나고, 붓글씨는 WOFF2 글리프 윤곽의 SVG 마스크 경로를 순서대로 재생합니다. 실제 작품의 필순 데이터는 아니며 원본 획 데이터가 오면 교체할 수 있습니다. `Replay / 다시 재생`으로 재현할 수 있습니다.
- 첫 장표의 구독 양식도 전송 없는 미리보기입니다.

## 실제 작품 교체

`src/scenes.js`에서 한국어 `lines`와 영문 `en.lines`를 함께 변경합니다. `src/i18n.js`는 UI 문구입니다. `public/artworks/`에 작품을 추가하고 해당 시안에 `artwork: '/artworks/작품명.png'`를 지정하면 텍스트 대신 이미지를 표시합니다. 배경과 포인터 효과는 유지되지만, 이미지에는 글리프 경로 재생이 적용되지 않습니다. 이미지의 대체 텍스트로 쓰이는 양쪽 언어의 `lines`도 실제 작품의 문구로 바꿉니다.

`npm run dev`와 `npm run build`는 `scripts/generate-calligraphy.mjs`를 먼저 실행해 브라우저와 동일한 로컬 WOFF2에서 SVG 데이터를 생성합니다. 생성된 `src/generated/`는 커밋하지 않습니다. 시안·언어별 동적 청크로 분리되어 선택한 언어만 불러옵니다. 개발 서버 실행 중 붓글씨 문장을 바꾸면 `npm run generate:calligraphy`를 다시 실행합니다.

각 시안은 `#scene-01`부터 `#scene-21`까지 해시 주소로 직접 열 수 있습니다. 첫 장표는 새 커버이므로 기존 시안의 숫자는 하나씩 뒤로 이동했습니다.

## 브라우저 검증

개발 서버를 실행한 뒤, Python Playwright·Pillow와 Chromium이 있는 환경에서 다음 검증을 실행합니다. 클라우드 환경에는 해당 도구가 준비되어 있습니다.

```sh
python3 tests/browser_smoke.py
```

`YEOBAEK_TEST_URL`로 다른 서버 주소를 지정하고 `CHROMIUM_PATH`로 Chromium 실행 경로를 지정할 수 있습니다. 검증은 기본 영어와 번역 누락, 언어·시안 유지, 네이티브 전체 화면과 대체 모드, 단축키 예외, 효과의 실제 프레임 변화, 폼, 저장 시안 이전, 동작 줄이기 및 한·영 21장 × 5개 화면 크기(210개 조합)를 확인합니다.

## 공개 배포: GitHub Pages

`.github/workflows/deploy-pages.yml`은 `main`에 push할 때 정적 파일을 빌드하고 GitHub Pages로 배포합니다. GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 한 번 선택해야 합니다. Pages 사용 가능 여부는 저장소 공개 설정과 계정 요금제에 따릅니다.

설정 후 **Actions → Deploy to GitHub Pages → Run workflow**를 실행하거나 `main`에 새 커밋을 push합니다. 성공한 배포의 `github-pages` 환경에서 실제 공개 주소를 확인합니다. 기본 배포 대상 경로는 `https://chadkim0119.github.io/HOMEPAGE/`이며, 배포 성공 및 접속 확인 전에는 활성 주소로 간주하지 않습니다.

Vite의 상대 경로 설정으로 `/HOMEPAGE/`에서도 JavaScript, CSS, 손글씨 폰트, favicon을 로드합니다. 실제 작품의 `/artworks/…` 경로도 배포 기준 경로에 맞춰 처리합니다.
