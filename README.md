# 꿀꿀 재래시장 티어표 (MAP01)

전국 재래시장 208곳을 주변 음식점 데이터로 점수 매겨 S~D 티어로 나눈 웹 페이지입니다. 게임 티어표처럼 보이도록 꾸몄고, 카카오맵·로드뷰·날씨·3D 돼지 투어가 붙어 있습니다. (공동작업 프로젝트)

## 페이지

| 파일 | 내용 |
|---|---|
| `main.html` | 랜딩 페이지 |
| `index.html` | 티어표 본 페이지. 필터, 시장 카드, 카카오맵, 상세 패널(로드뷰·날씨), 3D 돼지 투어 |

빌드 과정이 없는 정적 사이트입니다. 데이터는 `data.js`·`images.js`에 미리 만들어 두었습니다.

## 티어 산정 방식

`tools/fetch.py`가 소상공인 상가(상권)정보 API로 시장 반경 300m 안 음식점을 모아 아래 가중치로 점수를 냅니다.

| 지표 | 가중치 |
|---|---|
| 주변 음식점 수 (log) | 35% |
| 시장 안 음식점 수 (log) | 30% |
| 업종 다양성 | 20% |
| 프랜차이즈가 아닌 가게 비율 | 15% |

순위 기준으로 S 상위 8%, A 25%, B 55%, C 85%, 나머지는 D입니다. 음식점이 5곳 미만인 시장은 좌표를 제대로 잡지 못한 것으로 보고 뺍니다.

## 폴더 구조

```
index.html, main.html, style.css   페이지와 공용 스타일
data.js        시장·티어 데이터 (tools/fetch.py 생성)
images.js      시장 사진 (tools/images.py 생성)
medal.js       티어 정의와 메달 SVG
geo.js         시·도 경계 GeoJSON
pig.js         꿀돼지 3D 모델 (three.js)
tour.js        3D 돼지 투어
kakaoAPI/      카카오맵·로드뷰 모듈 (전역 KakaoMap)
weather-widget/ 시장 날씨 위젯 (Open-Meteo)
tools/         데이터 수집 파이썬 스크립트, 응답 캐시(.cache)
data/          markets.json, images.json (data.js·images.js의 원본 JSON)
```

모듈별 공개 API와 작업 규칙은 `kakaoAPI/CLAUDE.md`, `weather-widget/CLAUDE.md`에 있습니다.

## 로컬 실행

1. `.env.example`을 복사해 `.env`를 만들고 키를 채웁니다.
   - `KAKAO_JS_API_KEY`: 카카오 JavaScript 키. 카카오 개발자 콘솔에 등록한 도메인(예: `http://localhost:8000`)에서만 동작합니다.
   - `OPEN_METEO_URL`: Open-Meteo 예보 API 주소 (키 없음)
   - `KAKAO_REST_API_KEY`, `SDSC_KEY`: 데이터를 다시 수집할 때만 필요합니다.
2. 브라우저용 `env.js`를 만듭니다. 공개 키만 옮겨집니다.
   ```bash
   python weather-widget/make_env.py
   python kakaoAPI/make_env.py
   ```
3. 정적 서버를 띄우고 `http://localhost:8000/main.html`을 엽니다.
   ```bash
   python -m http.server 8000
   ```

## 데이터 다시 만들기

```bash
python tools/fetch.py    # data/markets.json, data.js
python tools/images.py   # data/images.json, images.js
```

시장 목록은 `tools/markets_seed.py`에 있습니다. API 응답은 `tools/.cache/`에 캐시되어 다시 실행하면 캐시를 씁니다.

## 배포 (Vercel)

`vercel.json`이 빌드할 때 두 `make_env.py`를 실행해 `env.js`를 만들고, 루트를 그대로 배포합니다. 첫 페이지(`/`)는 `main.html`로 리다이렉트됩니다. `.env`는 git에 올라가지 않으므로 Vercel 프로젝트 환경변수에 `KAKAO_JS_API_KEY`, `OPEN_METEO_URL`을 등록해야 합니다.

## 주의

- `env.js`는 브라우저에 그대로 노출됩니다. REST 키나 `SDSC_KEY` 같은 비밀 값은 넣지 않습니다.
- `.env`와 `env.js`는 `.gitignore`에 들어 있습니다.

## 데이터 출처

- 소상공인시장진흥공단 상가(상권)정보 API (공공데이터포털)
- 카카오맵 JavaScript SDK
- Open-Meteo 예보 API
- 시장 사진: 한국관광공사 TourAPI, 위키백과, 위키미디어 공용 (사진별 출처는 `images.js`의 `credit`)
