# SDVX 결승 전략실

결승 1~4라운드의 상대 선곡 기록 조회와 밴·스트래티지 판단을 지원하는 정적 PWA입니다.

## 라운드

- 1R: 17 HV, 쿠크시·Mindblow vs 마리랑·FULFIL
- 2R: Megamix, Mindblow vs 마리랑 또는 FULFIL
- 3R: 18 EN, 쿠크시·구스토 vs #ㄹㅇ이가·메가믹스 미출전 선수
- 4R: 18.0~19.9, 구스토 vs #ㄹㅇ이가

## 로컬 실행

```powershell
pnpm install
pnpm run data:build
pnpm run dev
```

`src/data/finals.json`은 배포용 정적 데이터입니다. 19레벨 결승 기준값은 `19lv_html.txt`의 Imperial 1-2 기록을 사용합니다. GitHub Actions에서는 로컬 원본 파일에 접근하지 않고 저장소에 포함된 이 파일로 빌드합니다.

## 검증

```powershell
pnpm run lint
pnpm run build
```

GitHub Pages는 `main` 브랜치 푸시 시 `.github/workflows/deploy.yml`로 배포됩니다.
