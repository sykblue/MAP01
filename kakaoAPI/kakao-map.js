// 카카오맵 모듈: 지도·시장 점·가게 점·로드뷰. 공개 API와 규칙은 CLAUDE.md
(function () {
  let state = "idle", failMsg = "";  // idle → loading → ready | failed
  const queue = [];                  // SDK 준비 전에 들어온 호출
  const boxes = new Set();           // 실패 문구를 띄울 컨테이너(지도·로드뷰)
  let map = null, markers = [], picks = [];
  let rv = null, rvClient = null, rvView = null, rvMsg = null, rvSeq = 0;

  const safe = f => { try { f(); } catch (e) { console.error("[KakaoMap]", e); } };
  const ll = (lat, lon) => new kakao.maps.LatLng(lat, lon);

  function msgEl(box) {
    let p = box.querySelector(":scope > .km-msg");
    if (!p) { p = document.createElement("p"); p.className = "km-msg"; box.append(p); }
    return p;
  }

  function fail(text) {
    state = "failed"; failMsg = text; queue.length = 0;
    boxes.forEach(b => { const p = msgEl(b); p.textContent = text; p.hidden = false; });
  }

  function load() {
    if (state !== "idle") return;
    const key = window.KAKAO_ENV && window.KAKAO_ENV.KAKAO_JS_API_KEY;
    if (!key) return fail("설정 없음(env.js)");
    state = "loading";
    const s = document.createElement("script");
    // autoload=false: 기본 로더는 document.write를 써서 동적 삽입에서 동작하지 않는다
    s.src = "https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=" + encodeURIComponent(key);
    s.onload = () => {
      if (!window.kakao || !kakao.maps) return fail("지도를 불러오지 못했어요");
      kakao.maps.load(() => { state = "ready"; queue.splice(0).forEach(safe); });
    };
    s.onerror = () => fail("지도를 불러오지 못했어요");
    document.head.append(s);
  }

  function run(f) {
    if (state === "ready") safe(f);
    else if (state !== "failed") { queue.push(f); load(); }
  }

  function attach(box) {
    box.classList.add("km");
    boxes.add(box);
    if (state === "failed") fail(failMsg);
  }

  function dot(lat, lon, cls, color, title, zIndex, onClick) {
    const el = document.createElement("div");
    el.className = "km-dot " + cls;
    if (color) el.style.background = color;
    el.title = title;
    el.addEventListener("click", onClick);
    const ov = new kakao.maps.CustomOverlay({position: ll(lat, lon), content: el, clickable: true, zIndex});
    ov.setMap(map);
    return {ov, el};
  }

  function mount(el, {markets = [], tierColor = {}, onSelect} = {}) {
    attach(el);
    run(() => {
      map = new kakao.maps.Map(el, {center: ll(36.3, 127.8), level: 13});
      markers = markets.filter(m => isFinite(m.lat) && isFinite(m.lon)).map(m => {
        const s = m.tier === "S";
        return {m, ...dot(m.lat, m.lon, s ? "km-s" : "", tierColor[m.tier], `${m.tier} · ${m.name}`, s ? 2 : 1,
          () => onSelect && onSelect(m))};
      });
      new ResizeObserver(() => map.relayout()).observe(el);
    });
  }

  function filter(list) {
    run(() => {
      const on = new Set(list);
      markers.forEach(({m, el}) => el.classList.toggle("km-off", !on.has(m)));
    });
  }

  function fit(list) {
    run(() => {
      if (!map || !list.length) return;
      const b = new kakao.maps.LatLngBounds();
      list.forEach(m => b.extend(ll(m.lat, m.lon)));
      map.setBounds(b, 20, 20, 20, 20);
      if (map.getLevel() < 7) map.setLevel(7);  // 점 하나·좁은 지역에서 과하게 확대되지 않게
    });
  }

  function focus(m, onPick) {
    run(() => {
      if (!map) return;
      picks.forEach(p => p.ov.setMap(null));
      picks = (m.picks || []).map((p, i) => dot(p.lat, p.lon, "km-pick", "", p.n, 3, () => onPick && onPick(i)));
      map.setLevel(3);
      map.setCenter(ll(m.lat, m.lon));
    });
  }

  function roadview(el, lat, lon) {
    attach(el);
    run(() => {
      if (!rvView || rvView.parentNode !== el) {
        rvView = document.createElement("div");
        rvView.className = "km-rv-view";
        el.replaceChildren(rvView);
        rvMsg = msgEl(el);
        rvMsg.hidden = true;
        rv = new kakao.maps.Roadview(rvView);
        rvClient = new kakao.maps.RoadviewClient();
        new ResizeObserver(() => rv.relayout()).observe(el);
      }
      const pos = ll(lat, lon), seq = ++rvSeq;
      rvClient.getNearestPanoId(pos, 50, id => {
        if (seq !== rvSeq) return;  // 늦게 도착한 이전 요청 결과는 버린다
        if (id) rv.setPanoId(id, pos);
        rvMsg.textContent = "근처 로드뷰가 없어요";
        rvMsg.hidden = !!id;
      });
    });
  }

  window.KakaoMap = {mount, filter, fit, focus, roadview};
})();
