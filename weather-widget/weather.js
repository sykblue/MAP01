// 재래시장 날씨 위젯: 지금부터 3시간 후까지 1시간 단위. 규칙은 CLAUDE.md.
// file://로 열어도 되도록 모듈이 아닌 일반 스크립트로 두고, 전역은 WeatherWidget 하나만 노출한다.
(function () {
  const CACHE_MS = 10 * 60 * 1000;
  const cache = {};  // "lat,lon" → {t, data}

  // WMO 날씨 코드 → 설명, 낮 아이콘, 밤 아이콘
  const WMO = {};
  [
    [[0], "맑음", "☀️", "🌙"], [[1], "대체로 맑음", "🌤️", "🌙"], [[2], "구름 조금", "⛅", "🌙"], [[3], "흐림", "☁️"],
    [[45, 48], "안개", "🌫️"], [[51, 53, 55], "이슬비", "🌦️"], [[56, 57], "어는 이슬비", "🌧️"],
    [[61], "약한 비", "🌧️"], [[63], "비", "🌧️"], [[65], "강한 비", "🌧️"], [[66, 67], "어는 비", "🌧️"],
    [[71], "약한 눈", "🌨️"], [[73], "눈", "🌨️"], [[75], "강한 눈", "❄️"], [[77], "싸락눈", "🌨️"],
    [[80], "약한 소나기", "🌦️"], [[81], "소나기", "🌧️"], [[82], "강한 소나기", "⛈️"], [[85, 86], "소낙눈", "🌨️"],
    [[95], "뇌우", "⛈️"], [[96, 99], "우박 동반 뇌우", "⛈️"],
  ].forEach(([codes, text, day, night]) => codes.forEach(c => WMO[c] = {text, day, night: night || day}));
  const sky = (code, isDay) => {
    const w = WMO[code] || {text: "날씨 정보", day: "🌡️", night: "🌡️"};
    return {text: w.text, icon: isDay === 0 ? w.night : w.day};
  };

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  let root, btn, icon, temp, name, msg, hours, expanded = false, seq = 0;

  function build() {
    root = el("div", "ww");
    btn = el("button", "ww-toggle");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    const mini = el("span", "ww-mini");
    icon = el("span", "ww-icon"); icon.setAttribute("aria-hidden", "true");
    temp = el("span", "ww-temp");
    name = el("span", "ww-name");
    msg = el("span", "ww-msg");
    mini.append(icon, temp, name, msg);
    hours = el("span", "ww-hours");
    btn.append(mini, hours);
    const credit = el("a", "ww-credit", "Open-Meteo.com");
    credit.title = "날씨 데이터: Open-Meteo.com (CC BY 4.0)";
    credit.href = "https://open-meteo.com/";
    credit.target = "_blank";
    credit.rel = "noopener";
    root.append(btn, credit);
    btn.addEventListener("click", () => {
      expanded = !expanded;
      btn.setAttribute("aria-expanded", String(expanded));
      root.classList.toggle("ww-open", expanded);
    });
    paint(null, null, "시장을 골라 주세요");
  }

  // 지금 칸은 current(15분 단위), +1~+3시간은 hourly. 강수확률은 current에 없어 hourly[0]을 쓴다.
  function rows(d) {
    const h = d.hourly, c = d.current;
    return [0, 1, 2, 3].map(i => ({
      when: i ? h.time[i].slice(11, 13) + "시" : "지금",
      temp: i ? h.temperature_2m[i] : c.temperature_2m,
      sky: i ? sky(h.weather_code[i], h.is_day[i]) : sky(c.weather_code, c.is_day),
      pop: h.precipitation_probability[i],
    }));
  }

  function paint(market, data, text) {
    name.textContent = market && market.name ? market.name : "";
    msg.textContent = text || "";
    hours.textContent = "";
    if (!data) {
      icon.textContent = "🌡️";
      temp.textContent = "";
      return;
    }
    const list = rows(data);
    icon.textContent = list[0].sky.icon;
    temp.textContent = Math.round(list[0].temp) + "°";
    list.forEach(r => {
      const cell = el("span", "ww-hour");
      const big = el("span", "ww-big", r.sky.icon);
      big.setAttribute("aria-hidden", "true");
      cell.append(
        el("span", "ww-when", r.when),
        big,
        el("span", "ww-t", Math.round(r.temp) + "°"),
        el("span", "ww-desc", r.sky.text),
        el("span", "ww-pop", "강수 " + (r.pop == null ? "-" : r.pop + "%")),
      );
      hours.append(cell);
    });
  }

  function load(base, lat, lon) {
    const key = lat + "," + lon, hit = cache[key];
    if (hit && Date.now() - hit.t < CACHE_MS) return Promise.resolve(hit.data);
    const q = new URLSearchParams({
      latitude: lat, longitude: lon,
      current: "temperature_2m,weather_code,is_day",
      hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
      forecast_hours: 4, timezone: "Asia/Seoul",
    });
    return fetch(base + "?" + q).then(r => r.json()).then(d => {
      if (d.error || !d.current || !d.hourly || !(d.hourly.time.length >= 4)) throw new Error(d.reason || "응답 형식 오류");
      cache[key] = {t: Date.now(), data: d};
      return d;
    });
  }

  function mount(target) {
    if (!root) build();
    root.classList.toggle("ww-floating", !target);
    (target || document.body).append(root);
    root.hidden = false;
  }

  function show(market) {
    if (!root) mount();
    root.hidden = false;
    const id = ++seq;  // 늦게 온 이전 응답은 버린다
    if (!market) return paint(null, null, "시장을 골라 주세요");
    if (!Number.isFinite(market.lat) || !Number.isFinite(market.lon)) return paint(market, null, "위치 정보 없음");
    const base = window.WEATHER_ENV && window.WEATHER_ENV.OPEN_METEO_URL;
    if (!base) return paint(market, null, "설정 없음(env.js)");
    paint(market, null, "불러오는 중…");
    load(base, market.lat, market.lon).then(
      d => { if (id === seq) paint(market, d); },
      e => { if (id === seq) { console.warn("[WeatherWidget]", e); paint(market, null, "날씨를 불러오지 못했어요"); } },
    );
  }

  function hide() {
    if (root) root.hidden = true;
  }

  window.WeatherWidget = {mount, show, hide};
})();
