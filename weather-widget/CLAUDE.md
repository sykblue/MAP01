# weather-widget

재래시장 위치의 날씨를 보여 주는 위젯. 꿀꿀 재래시장 티어표 프로젝트(상위 폴더)의 어느 페이지에든 붙일 수 있게 만든다.
붙일 페이지(현재 `../index.html`, 작성 중인 랜딩페이지 등)는 아직 확정되지 않았다. 그래서 위젯은 특정 페이지의 DOM·함수·CSS에 의존하지 않는다.

## 작업 범위

날씨 기능은 이 폴더(`weather-widget/`) 하나로 분리한다.

- 코드 작성 중 만드는 파일은 **모두 이 폴더 안에** 만든다. 스크립트, 스타일, 설정, 데모, 테스트, 생성물(`env.js`)이 모두 해당된다.
- 이 폴더 밖의 파일은 만들지도 고치지도 않는다. 상위 `index.html`, 랜딩페이지, `tools/`, 루트 `.gitignore`·`.env`가 해당된다. 밖의 파일을 고쳐야 할 것 같으면 작업을 멈추고 먼저 묻는다.
- 밖의 파일을 **읽는 것**은 괜찮다(예: `demo.html`이 `../data.js`를 불러오는 것).
- 이 폴더 안에서는 상대 경로만 쓴다. 그래야 폴더째 옮겨도 동작한다.

## 기능

- 대상: 호스트 페이지가 넘겨 주는 시장 하나. `{name, lat, lon}`만 쓴다(`../data.js`의 `MARKET_DATA.markets` 항목이 이 모양이다).
- 데이터: 현재 시각부터 3시간 후까지 1시간 간격으로 4칸(지금, +1h, +2h, +3h)
  - 칸마다 시각, 날씨 아이콘·설명, 기온(°C), 강수확률(%)
- 두 가지 상태를 오간다
  - **작은 위젯(기본)**: 시장 이름, 지금 날씨 아이콘, 기온
  - **펼친 위젯**: 위 4칸 시간별 정보와 출처 표기
  - 위젯을 누르면 펼쳐지고, 다시 누르면 작은 위젯으로 돌아간다. 다른 상태나 화면은 없다.
- 다른 시장이 넘어오면 그 시장 날씨로 바뀐다. 펼침/접힘 상태는 그대로 둔다.

## 공개 API

전역은 하나만 노출한다.

```js
window.WeatherWidget = {
  mount(el),     // el 안에 위젯을 그린다. 생략하면 document.body 오른쪽 아래에 고정
  show(market),  // {name, lat, lon}. 이 시장의 날씨를 불러와 표시
  hide(),        // 위젯을 숨긴다(예: 전체 화면 오버레이가 열렸을 때)
};
```

호스트 페이지 연결 예시:

```html
<link rel="stylesheet" href="weather-widget/weather.css">
<script src="weather-widget/env.js"></script>
<script src="weather-widget/weather.js"></script>
<script>
  WeatherWidget.mount(document.getElementById("weather"));  // 자리를 정하고 싶을 때만
  WeatherWidget.show(market);  // 시장을 고를 때마다 호출
</script>
```

어느 페이지에 붙일지, 어떤 이벤트에서 `show`를 부를지는 호스트 쪽 몫이다. 위젯 작업 중에는 호스트 페이지를 고치지 않는다. 연결 작업은 따로 요청받았을 때 한다.

## 날씨 API: Open-Meteo

- 문서: https://open-meteo.com/en/docs
- **API 키가 없다.** 프록시 서버 없이 브라우저에서 바로 호출한다. 주소만 `.env`로 뺀다(아래 "설정" 참고).
- 무료 조건: 비상업적 용도만 허용된다. 한도는 하루 10,000회, 시간당 5,000회, 분당 600회다. 상업적 용도로 바뀌면 유료 플랜(키 사용)으로 옮겨야 한다.
- 라이선스: 데이터는 CC BY 4.0이라 **출처 표기가 필수다.** 펼친 위젯 아래에 `날씨: Open-Meteo.com` 링크(https://open-meteo.com/)를 넣는다.

```
{OPEN_METEO_URL}?latitude={lat}&longitude={lon}
  &current=temperature_2m,weather_code,is_day
  &hourly=temperature_2m,precipitation_probability,weather_code,is_day
  &forecast_hours=4&timezone=Asia/Seoul
```

- `forecast_hours=4`는 현재 시(時)부터 4개의 시간 단위 값을 준다. `hourly.time[0]`이 이번 시각 정각이다.
- 4칸 채우기
  - 지금: 기온·날씨는 `current`(15분 단위 값이라 더 정확), 강수확률은 `hourly.precipitation_probability[0]`
  - +1h~+3h: `hourly`의 인덱스 1, 2, 3
- `hourly.time`은 `"2026-10-23T15:00"` 형태의 서울 현지 시각 문자열이다. 시각은 `HH시`로 표기하고, 문자열에서 시를 잘라 쓰면 된다(`Date`로 변환하지 않는다).
- `weather_code`는 WMO 코드다. 설명이나 아이콘은 주지 않으므로 코드를 한국어 설명과 이모지로 바꾸는 표 하나를 `weather.js`에 둔다. `is_day`가 0이면 맑음·구름 조금을 밤 아이콘(🌙)으로 바꾼다.

| 코드 | 설명 | 코드 | 설명 |
|---|---|---|---|
| 0 | 맑음 | 61, 63, 65 | 비 (약·보통·강) |
| 1 | 대체로 맑음 | 66, 67 | 어는 비 |
| 2 | 구름 조금 | 71, 73, 75 | 눈 (약·보통·강) |
| 3 | 흐림 | 77 | 싸락눈 |
| 45, 48 | 안개 | 80, 81, 82 | 소나기 (약·보통·강) |
| 51, 53, 55 | 이슬비 | 85, 86 | 소낙눈 |
| 56, 57 | 어는 이슬비 | 95 | 뇌우 |
| | | 96, 99 | 우박 동반 뇌우 |

- 표에 없는 코드가 오면 "날씨 정보"와 기본 아이콘을 쓴다.
- 같은 좌표의 응답은 메모리에 10분 동안 캐시한다(`{ "lat,lon": {t, data} }`). 시장을 오갈 때 다시 부르지 않기 위해서다.

## 설정 (.env → env.js)

API 주소는 **루트 `.env`**의 `OPEN_METEO_URL`에 둔다(형식은 루트 `.env.example`). 쿼리 파라미터는 위젯 로직이므로 코드에 둔다.

- 브라우저는 `.env`를 직접 읽지 못한다. Live Server는 점(.)으로 시작하는 파일을 404로 막고, `file://`에서는 `fetch`가 안 된다.
- 그래서 `make_env.py`가 `.env`를 읽어 `env.js`를 만든다. 상위 `tools/fetch.py`가 `data.js`를 만드는 것과 같은 방식이다.
  - 실행: `python weather-widget/make_env.py`
  - 출력: `weather-widget/env.js` → `window.WEATHER_ENV = {"OPEN_METEO_URL": "..."};`
  - 표준 라이브러리만 쓴다. `KEY=VALUE` 줄만 읽고 빈 줄과 `#` 주석은 건너뛴다.
  - **허용 목록(`PUBLIC_KEYS`)에 있는 키만 옮긴다.** 루트 `.env`에는 상가정보 키 `SDSC_KEY` 같은 비밀 값도 있기 때문이다. 비밀 값은 허용 목록에 절대 넣지 않는다.
  - 값은 루트 `.env`에서 먼저 찾고, 없으면 같은 이름의 환경변수에서 찾는다. 둘 다 없으면 안내를 출력하고 종료 코드 1로 끝난다.
- `weather.js`는 `window.WEATHER_ENV.OPEN_METEO_URL`을 읽는다. 값이 없으면 요청하지 않고 위젯에 "설정 없음(env.js)"을 표시한다. 주소를 코드에 기본값으로 박아 두지 않는다.
- `env.js`는 브라우저에 그대로 보인다. 그래서 공개해도 되는 값만 담는다.
- git: 루트 `.env`와 `env.js`는 루트 `.gitignore`로 제외되어 있고, `.env.example`만 커밋한다.
- 배포(Vercel): `env.js`와 `.env`가 git에 없으므로 빌드 때 만든다.
  - 루트 `vercel.json`의 `buildCommand`가 `python3 weather-widget/make_env.py`를 실행한다.
  - 값은 Vercel 프로젝트 환경변수 `OPEN_METEO_URL`(타입 Config)에 등록해 둔다. `make_env.py`는 `.env`가 없거나 값이 비면 환경변수에서 읽는다.

## 만드는 규칙

- 빌드 도구와 npm 없이 **일반 `<script>`**로 만든다(ES module 아님). 상위 프로젝트 페이지가 `file://`로도 열리기 때문이다.
- 파일 구성
  - `weather.js`: 위젯 로직
  - `weather.css`: 위젯 스타일
  - `make_env.py`: 루트 `.env` → `env.js` 생성
  - `demo.html`: 확인용 페이지
- 모든 클래스는 `ww-` 접두사를 붙이고 위젯 루트 아래로 범위를 한정한다. 호스트 스타일과 서로 섞이지 않게 하려는 것이다.
- 색과 폰트는 위젯 루트의 CSS 변수(`--ww-bg`, `--ww-fg`, `--ww-accent`, `--ww-font`)로 둔다. 호스트가 덮어써서 페이지 톤에 맞출 수 있다. 기본값은 상위 프로젝트 톤(분홍 돼지 테마, Black Han Sans)에 맞춘다.
- 고정 위치로 띄울 때는 화면 구석 다른 요소와 겹칠 수 있다. 그래서 위치를 `mount(el)`로 호스트가 정할 수 있게 한다.

## 필수 처리

- 로딩 중, 실패(네트워크·API 오류, 응답의 `error: true`), 시장 미지정 상태를 각각 짧은 문구로 보여 준다. 실패해도 호스트 페이지는 멈추지 않는다(예외를 밖으로 던지지 않음).
- `show`가 빠르게 여러 번 불리면 마지막 시장의 응답만 그린다. 늦게 도착한 이전 응답은 버린다.
- `show`에 좌표가 없거나 숫자가 아닌 값이 오면 요청하지 않고 "위치 정보 없음"을 표시한다.
- 시장 이름 등 문자열은 `textContent`로 넣는다. `innerHTML`에 넣지 않는다.
- 접근성: 위젯은 `<button>`으로 만들고 `aria-expanded`로 상태를 알린다. 키보드(Enter/Space)로도 토글된다. 이모지 아이콘에는 `aria-hidden`을 걸고 설명은 글자로 보여 준다.

## 하지 않는 것

- 3시간 넘는 예보, 일별 예보, 미세먼지, 기상 특보, 위치 권한(GPS) 요청
- 단위·언어 설정, 새로고침 버튼
- 프레임워크나 차트 라이브러리 추가
- 호스트 페이지(`../index.html`, 랜딩페이지) 수정

## 확인 방법

`demo.html`은 `../data.js`를 불러온다. 시장 몇 곳을 고르는 버튼을 두고, 버튼을 누르면 `WeatherWidget.show`를 호출한다.

1. 루트 `.env`에 `OPEN_METEO_URL`이 있는지 확인하고 `python weather-widget/make_env.py`를 실행한다.
2. `weather-widget/demo.html`을 Live Server(포트 5502)나 `file://`로 연다.
3. 시장을 고르면 작은 위젯에 그 시장의 현재 기온이 나온다.
4. 누르면 4칸 시간별 날씨와 출처가 펼쳐지고, 다시 누르면 접힌다. Tab으로 이동해 Enter를 눌러도 같다.
5. 시장을 빠르게 연달아 바꿔도 마지막 시장의 날씨만 남는다.
6. `env.js`를 지우고 새로고침하면 "설정 없음" 문구가 나온다.
7. DevTools에서 오프라인으로 바꾸고 다른 시장을 고르면 오류 문구가 나오고 페이지는 계속 동작한다.
