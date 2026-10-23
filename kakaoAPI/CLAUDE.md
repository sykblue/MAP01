# kakaoAPI

꿀꿀 재래시장 티어표(상위 폴더)의 지도를 Leaflet + OpenStreetMap에서 **카카오맵**으로 바꾸는 모듈.
`weather-widget/`처럼 기능은 이 폴더에 만들고, 호스트 페이지(`../index.html` 등)는 공개 API를 불러 쓰기만 한다.

## 작업 범위

- 코드 작성 중 만드는 파일은 **모두 이 폴더 안에** 만든다. 스크립트, 스타일, 설정, 데모, 생성물(`env.js`)이 모두 해당된다.
- 이 폴더 밖에서 고치는 파일은 루트 `vercel.json`(빌드 명령), 루트 `.env.example`(키 형식), 그리고 연결부(`../index.html`의 `KakaoMap.*` 호출, `../style.css`의 `#map`·`.rv`)뿐이다.
- `../index.html`은 이미 연결되어 있다. 모듈 기능을 바꿀 때는 공개 API를 유지해 호스트를 다시 고치지 않게 한다.
- 밖의 파일을 **읽는 것**은 괜찮다(`demo.html`이 `../data.js`를 불러오는 것).
- 이 폴더 안에서는 상대 경로만 쓴다.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `kakao-map.js` | 지도·시장 점·가게 점·로드뷰. 전역 `KakaoMap` 하나만 노출 |
| `kakao-map.css` | 점 오버레이·안내 문구 스타일 (`km-` 접두사) |
| `make_env.py` | 루트 `.env` → `env.js` |
| `env.js` | 생성물. git 제외 |
| `demo.html` | 단독 확인 페이지 |

## 공개 API

```js
window.KakaoMap = {
  mount(el, {markets, tierColor, onSelect}), // el에 지도와 시장 점. 점을 누르면 onSelect(market)
  filter(list),            // list에 든 시장만 진하게, 나머지는 흐리게
  fit(list),               // list가 다 보이게 맞춤 (최대 level 7까지만 확대)
  focus(market, onPick),   // 시장으로 확대(level 3)하고 가게 점 표시. 가게 점을 누르면 onPick(index)
  roadview(el, lat, lon),  // el 안에 반경 50m 안 카카오 로드뷰
  parking(market, lots, onPick), // 주차장 P 점 [{n, lat, lon}]. 누르면 onPick(index). 부를 때마다 이전 점은 지운다
  route(path, {color, dashed, fit}), // 선 하나 [[lat, lon], ...] (주차장 → 시장 걷는 길). null이면 지운다
  ready(f),                // SDK가 준비되면 f 실행. 스카이뷰 투어(tour.js)가 같은 SDK를 쓰려고 부른다
  status(),                // {state: "idle"|"loading"|"ready"|"failed", message}
};
```

- 걷는 길 좌표는 호스트(`../index.html`)가 OSM 도보 길찾기(`routing.openstreetmap.de`)에서 받아 `route`로 넘긴다. 모듈은 선만 그린다.

- 시장 객체는 `../data.js`의 `MARKET_DATA.markets` 항목 그대로다. `{name, tier, lat, lon, picks:[{n, c, lat, lon}]}`만 쓴다.
- `tierColor`는 `{S:"#ff5a5f", ...}`. 호스트의 CSS 변수 값을 넘긴다.
- SDK가 비동기로 뜨므로 준비 전 호출은 큐에 모았다가 순서대로 실행한다. 호스트는 로딩 순서를 신경 쓰지 않는다.
- `mount`는 한 번만 부른다.

`../index.html` 연결 현황:

```html
<link rel="stylesheet" href="kakaoAPI/kakao-map.css">
<script src="kakaoAPI/env.js"></script>
<script src="kakaoAPI/kakao-map.js"></script>
<script>
  KakaoMap.mount($("map"), {markets: MK, tierColor: TIER_COLOR, onSelect: m => select(m)});  // "// 지도"
  KakaoMap.filter(list);                                          // render() 끝
  setTimeout(() => KakaoMap.focus(m, i => ul.children[i].click()), 260);  // select(), 서랍이 열린 뒤
  KakaoMap.roadview($("rv"), lat, lon);                           // showRoadview()
</script>
```

- 지도는 상세 서랍(`#drawer`) 안에 있다. 서랍은 `transform`으로 열려 지도 크기가 바뀌지 않는다.
- `fit`은 지금 호스트에서 쓰지 않는다(지역 맞춤 기능이 빠짐). 데모에서만 쓴다.
- `카카오 로드뷰`·`네이버 지도` 바깥 링크는 그대로 둔다.
- `tour.js`(스카이뷰 투어)는 자체 `kakao.maps.Map`을 만들지만, SDK는 `KakaoMap.ready`로 이 모듈이 불러온 것을 함께 쓴다(SDK를 두 번 넣지 않는다).

## 키 두 개 (.env)

루트 `.env`에 둔다. 형식은 루트 `.env.example`에 있다.

| 변수 | 쓰는 곳 | 브라우저 노출 |
|---|---|---|
| `KAKAO_JS_API_KEY` | 지도 SDK | **된다.** JS 키는 원래 공개용이고 등록 도메인으로 막는다 |
| `KAKAO_REST_API_KEY` | 파이썬 도구(`tools/`)에서만 | **절대 안 된다.** env.js·HTML·JS에 넣지 않는다 |

- 지도에는 JS 키만 필요하다.
- REST 키 용도: 위치가 대략값인 시장(`located: false`, 62곳)의 좌표를 카카오 로컬 API로 보정할 때 `tools/fetch.py`에서 쓴다. 따로 요청받았을 때만 한다.
  - `GET https://dapi.kakao.com/v2/local/search/keyword.json?query={시장명}`, 헤더 `Authorization: KakaoAK {KAKAO_REST_API_KEY}`

### .env → env.js

- `python kakaoAPI/make_env.py` → `kakaoAPI/env.js`에 `window.KAKAO_ENV = {"KAKAO_JS_API_KEY": "..."};`
- `PUBLIC_KEYS = ["KAKAO_JS_API_KEY"]`만 옮긴다. **`KAKAO_REST_API_KEY`·`SDSC_KEY`는 허용 목록에 넣지 않는다.**
- `.env`에 값이 없으면 같은 이름의 환경변수에서 찾고, 둘 다 없으면 안내를 출력하고 종료 코드 1로 끝난다.
- `env.js`는 루트 `.gitignore`의 `env.js` 줄로 제외된다.
- Vercel: 루트 `vercel.json`의 `buildCommand`가 이 스크립트도 실행한다. 프로젝트 환경변수에 `KAKAO_JS_API_KEY`(타입 Config)를 등록한다. REST 키는 Vercel에 올리지 않는다.

## 카카오 개발자 콘솔 설정

https://developers.kakao.com → 내 애플리케이션

1. **앱 키**에서 JavaScript 키와 REST API 키를 복사해 `.env`에 넣는다.
2. **플랫폼 → Web → 사이트 도메인**에 등록한다. 등록하지 않은 주소에서는 지도가 뜨지 않는다.
   - `http://localhost:5502`, `http://127.0.0.1:5502` (Live Server; 포트가 5500이면 그 주소도)
   - Vercel 배포 도메인
3. **카카오맵 사용 설정**을 켠다(신규 앱은 꺼져 있다).

`file://`로 열면 도메인 확인에 실패해 지도가 뜨지 않는다. 확인은 Live Server로 한다.

## 구현 메모

- SDK는 `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=...`를 동적으로 넣고 `kakao.maps.load()`로 시작한다. 기본 로더는 `document.write`를 써서 동적 삽입에서 동작하지 않는다.
- 라이브러리(`services`, `clusterer`)는 쓰지 않는다. 점이 208개라 클러스터 없이 충분하다.
- 줌 대응: 카카오 `level ≈ 19 - Leaflet zoom`. 첫 화면 level 13, 시장 선택 level 3, 지역 맞춤 최대 level 7.
- 점은 `CustomOverlay`에 원형 `<div>`를 넣는다. `kakao.maps.Circle`은 반지름이 미터라 줌마다 크기가 바뀌어 쓰지 않는다.
  - 시장 점: 티어색, S티어 14px·나머지 10px, 흰 테두리. 가게 점: 10px, `#ff9ec4`, 테두리 `#c2185b`.
  - 이름은 `title`로 넣는다(`innerHTML` 금지). 흐림은 `km-off` 클래스.
- 컨테이너 크기가 바뀌면 `ResizeObserver`로 `relayout()`을 부른다.
- 로드뷰는 `RoadviewClient.getNearestPanoId(pos, 50, cb)`. 없으면(`null`) "근처 로드뷰가 없어요"를 덮어 보인다. 빠르게 연달아 부르면 마지막 요청 결과만 쓴다.
- 카카오 로고·저작권 표시는 약관상 가리지 않는다.

## 필수 처리

- 키가 없으면 "설정 없음(env.js)", SDK 로드 실패면 "지도를 불러오지 못했어요"를 지도·로드뷰 자리에 보인다. 예외를 밖으로 던지지 않아 호스트 페이지는 계속 동작한다.

## 하지 않는 것

- 장소 검색, 카카오 길찾기 API, 현재 위치(GPS), 마커 클러스터, 지도 종류 전환(2D 서랍 지도)
- REST 키를 브라우저에서 쓰는 것, 프록시 서버 추가

## 확인 방법

1. 루트 `.env`에 `KAKAO_JS_API_KEY`를 넣고 `python kakaoAPI/make_env.py`를 실행한다. `kakaoAPI/env.js`에 REST 키가 **없는지** 확인한다.
2. `kakaoAPI/demo.html`을 Live Server(포트 5502)로 연다.
3. 전국 지도에 시장 점 208개가 티어색으로 보이고, 마우스를 올리면 `티어 · 이름`이 뜬다.
4. 지역 버튼을 누르면 그 지역으로 맞춰지고 다른 지역 점은 흐려진다.
5. 시장 점을 누르면 그 시장으로 확대되고 분홍 가게 점이 생기며, 로드뷰가 첫 가게 위치로 바뀐다. 가게 점을 누르면 로드뷰가 그 위치로 바뀐다.
6. 창 폭을 줄였다 늘려도 지도·로드뷰가 잘리지 않는다.
7. `env.js`를 지우고 새로고침하면 안내 문구가 나오고 콘솔에 잡히지 않은 오류가 없다.
8. `../index.html`에서 카드를 눌러 서랍을 열면 지도가 그 시장으로 확대되고 가게 점·로드뷰가 나온다. 가게 목록을 누르면 로드뷰가 바뀌고, 지도의 가게 점을 누르면 목록의 그 가게가 선택된다. 필터·검색을 바꾸면 지도 점이 흐려진다.
