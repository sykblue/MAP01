// 돼지 스카이뷰 투어: 카카오 지도(스카이뷰) 위를 돼지가 날아다니며 지역별 1등 시장을 안내한다.
// 지도는 카카오맵 JavaScript API, 돼지는 three.js로 지도 위 투명 캔버스(화면 가운데)에 그린다.
window.initTour = function (THREE, api) {
  const {markets, tierColor, pigSay, openMarket, parkOf = () => [], infoOf = () => ({}), imgOf = () => null} = api;
  const narrow = () => innerWidth <= 600;
  // 시장 사진 (images.js). 없으면 빈 문자열 — 지도가 이미 위성 사진이라 대신 채우지 않는다
  const photo = (m, cls) => {
    const img = imgOf(m);
    return img ? `<div class="${cls}"><img src="${esc(img.src)}" alt="${esc(m.name)} 사진" onerror="this.parentNode.remove()"><span class="cr">${esc(img.credit || img.from || "")}</span></div>` : "";
  };
  const K = kakao.maps;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
  const parkText = m => {
    const lots = parkOf(m), p = lots[0];
    if (!p) return "근처에 등록된 주차장 없음";
    return `${p.n || "가까운 주차장"} · 직선 ${p.d}m${p.fee ? " · " + p.fee : ""}${lots.length > 1 ? ` 외 ${lots.length - 1}곳` : ""}`;
  };
  const ORDER = ["서울","인천","경기","강원","충북","세종","대전","충남","전북","광주","전남","제주","경남","부산","울산","대구","경북"];
  const FULL = {"서울":"서울특별시","인천":"인천광역시","경기":"경기도","강원":"강원도","충북":"충청북도","세종":"세종특별자치시",
    "대전":"대전광역시","충남":"충청남도","전북":"전라북도","광주":"광주광역시","전남":"전라남도","제주":"제주특별자치도",
    "경남":"경상남도","부산":"부산광역시","울산":"울산광역시","대구":"대구광역시","경북":"경상북도"};
  const STOPS = ORDER.map(r => ({region: r, list: markets.filter(m => m.region === r)})).filter(s => s.list.length);
  const TOPS = new Set(STOPS.map(s => s.list[0]));

  const ROUTE_COLOR = "#ffb36b", PARK_COLOR = "#4da3ff";
  const ARRIVE_LEVEL = 1;   // 도착하면 가장 가까운 확대 수준(1)까지 내려와 시장을 크게 보여 준다
  const MOVE_PX = 260;      // 자유 이동 속도(화면 px/초) — 확대 수준과 상관없이 같은 빠르기로 느껴지게
  const ll = (lat, lon) => new K.LatLng(lat, lon);
  const at = m => ll(m.lat, m.lon);
  const meters = (lat1, lon1, lat2, lon2) => {
    const r = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2;
    return 2 * r * Math.asin(Math.sqrt(a));
  };

  const el = document.getElementById("tour");
  const mapEl = el.querySelector(".kmap");
  const canvas = el.querySelector(".tour-pig");
  const card = el.querySelector(".tour-card");
  const near = el.querySelector(".tour-near");
  const dots = el.querySelector(".tour-dots");
  let map, renderer, scene, camera, pig, shadow, built = false, running = false;

  function build() {
    map = new K.Map(mapEl, {center: at(STOPS[0].list[0]), level: 8, mapTypeId: K.MapTypeId.HYBRID, draggable: false});

    // 시장 점: 색 = 티어, 지역 1등은 크게 + 이름표. 누르면 그 시장 상세로 간다
    markets.forEach(m => {
      const top = TOPS.has(m);
      const dot = document.createElement("div");
      dot.className = "kdot" + (top ? " top" : "");
      dot.style.background = tierColor[m.tier];
      dot.title = `${m.tier} · ${m.name}`;
      dot.onclick = () => { clearTimeout(autoTimer); showInfo(m); showParks(m); };
      new K.CustomOverlay({map, position: at(m), content: dot, zIndex: top ? 3 : 2});
      if (top) {
        const lb = document.createElement("div");
        lb.className = "klabel"; lb.textContent = m.name; lb.style.color = tierColor[m.tier];
        new K.CustomOverlay({map, position: at(m), content: lb, yAnchor: 2.4, zIndex: 3});
      }
    });
    // 투어 경로선: 지역 1등 시장을 투어 순서대로 잇는다
    new K.Polyline({map, path: STOPS.map(s => at(s.list[0])), strokeWeight: 4, strokeColor: ROUTE_COLOR, strokeOpacity: .85});

    // 돼지: 위에서 비스듬히 내려다보는 카메라
    renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
    camera.position.set(0, 6.5, 7); camera.lookAt(0, .9, 0);
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x553322, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 6, 4); scene.add(sun);
    pig = buildPig(THREE); scene.add(pig.root);
    shadow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({color: 0, transparent: true, opacity: .35}));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .01; scene.add(shadow);

    STOPS.forEach((s, i) => {
      const b = document.createElement("button");
      b.textContent = s.region; b.onclick = () => go(i);
      dots.appendChild(b);
    });
    addEventListener("resize", resize);
    built = true;
  }

  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    map.relayout();
  }

  // 주차장: 지금 보는 시장 주변에만 P 표시와 시장까지 잇는 파란 줄 (실제 위치 그대로)
  let parkObjs = [], parkFor = null;
  function clearParks() { parkObjs.forEach(o => o.setMap(null)); parkObjs = []; parkFor = null; }
  function showParks(m) {
    if (parkFor === m) return;
    clearParks(); parkFor = m;
    parkOf(m).forEach((p, i) => {
      const pos = ll(p.lat, p.lon);
      parkObjs.push(new K.Polyline({map, path: [pos, at(m)], strokeWeight: i ? 3 : 6, strokeColor: PARK_COLOR, strokeOpacity: .9}));
      const icon = document.createElement("div");
      icon.className = "pmk"; icon.textContent = "P"; icon.title = `${p.n || "주차장"} · 직선 ${p.d}m`;
      parkObjs.push(new K.CustomOverlay({map, position: pos, content: icon, zIndex: 4}));
    });
  }

  // 시장 정보 말풍선: 짧은 설명 (위키백과가 없으면 데이터로 만든 설명)
  const descOf = m => infoOf(m).d ||
    `${m.sido || m.region} ${m.sgg || ""}에 있는 재래시장이에요. 반경 300m 안에 음식점 ${m.food}곳, 시장 안 가게 ${m.inside}곳이 모여 있고 대표 먹거리는 ${m.signature}예요.`;
  let infoOv = null, infoFor = null;
  function hideInfo() { if (infoOv) infoOv.setMap(null); infoOv = null; infoFor = null; }
  function showInfo(m) {
    if (infoFor === m) return;
    hideInfo(); infoFor = m;
    const inf = infoOf(m), box = document.createElement("div");
    box.className = "kinfo" + (narrow() ? "" : " side");
    box.innerHTML = `
      ${photo(m, "ki-photo")}
      <div class="ki-body">
        <div class="ki-head"><b>${esc(m.name)}</b><span class="tier-bg-${m.tier}">${m.tier}</span></div>
        <p>${esc(descOf(m))}</p>
        <div class="ki-foot">${inf.url ? `<a href="${esc(inf.url)}" target="_blank" rel="noopener">위키백과</a>` : ""}<button>상세·로드뷰</button></div>
      </div>`;
    box.querySelector("button").onclick = () => leaveTo(m);
    // 사진이 들어가 말풍선이 커서: 넓은 화면은 시장 점 왼쪽 옆, 좁은 화면은 위쪽
    infoOv = new K.CustomOverlay(narrow()
      ? {map, position: at(m), content: box, yAnchor: 1.06, zIndex: 6}
      : {map, position: at(m), content: box, xAnchor: 1.06, yAnchor: .5, zIndex: 6});
  }

  // 이동 상태
  let idx = -1, move = null, auto = true, autoTimer = null, free = false, nearM = null;
  const keys = {};
  let heading = 0, run = 0, lift = 0, hopT = -1;

  function go(i) {
    free = false; el.classList.remove("free");
    clearTimeout(autoTimer);
    idx = (i + STOPS.length) % STOPS.length;
    const stop = STOPS[idx], top = stop.list[0];
    const c = map.getCenter(), lat0 = c.getLat(), lon0 = c.getLng();
    const d = meters(lat0, lon0, top.lat, top.lon);
    // 멀리 갈수록 높이 날아오르듯 지도를 축소했다가, 도착하면 다시 내려온다
    const level = d < 3000 ? 6 : d < 20000 ? 8 : d < 80000 ? 10 : 12;
    map.setLevel(level, {animate: true});
    move = {from: [lat0, lon0], to: [top.lat, top.lon], k: -.3, dur: Math.min(3.5, 1.4 + d / 80000), lift: level >= 10 ? 1.8 : 1};
    heading = Math.atan2((top.lon - lon0) * Math.cos(lat0 * Math.PI / 180), -(top.lat - lat0));
    [...dots.children].forEach((b, j) => b.classList.toggle("on", j === idx));
    card.classList.add("hide"); clearParks(); hideInfo();
    pigSay(`${FULL[stop.region]}(으)로 날아간다~ 꿀꿀! 🐷💨`);
  }

  function arrive() {
    const stop = STOPS[idx], list = stop.list, top = list[0];
    map.setLevel(ARRIVE_LEVEL, {animate: true});
    // 돼지가 화면 가운데를 가리므로 시장(과 정보 말풍선)이 돼지 머리 위쪽에 보이게 살짝 옮긴다
    setTimeout(() => {
      if (move || free || STOPS[idx] !== stop) return;
      const proj = map.getProjection(), p = proj.containerPointFromCoords(at(top));
      map.panTo(proj.coordsFromContainerPoint(new K.Point(p.x, p.y + (narrow() ? 100 : 150))));
    }, 600);
    showInfo(top);
    const counts = ["S","A","B","C","D"].map(t => [t, list.filter(m => m.tier === t).length]).filter(([, n]) => n);
    card.innerHTML = `
      ${photo(top, "tc-photo")}
      <div class="tc-body">
        <div class="tc-head"><span>${idx + 1} / ${STOPS.length}</span><h3>${FULL[stop.region]}</h3><small>시장 ${list.length}곳</small></div>
        <div class="tc-tiers">${counts.map(([t, n]) => `<span class="tier-bg-${t}">${t} ${n}</span>`).join("")}</div>
        <ol>${list.slice(0, 3).map(m => `<li data-n="${esc(m.name)}"><b>${esc(m.name)}</b> <i class="tier-bg-${m.tier}">${m.tier}</i><small>${esc(m.signature)}</small></li>`).join("")}</ol>
        <div class="tc-park"><span class="pmk">P</span><span>${esc(parkText(top))}${parkOf(top).length ? "<small>지도의 파란 P와 줄이 주차장이에요</small>" : ""}</span></div>
        <button class="tc-go">${esc(top.name)} 상세·로드뷰 보기</button>
      </div>`;
    card.querySelectorAll("li").forEach(li => li.onclick = () => leaveTo(list.find(m => m.name === li.dataset.n)));
    card.querySelector(".tc-go").onclick = () => leaveTo(top);
    card.classList.remove("hide");
    showParks(top);
    hopT = 0;
    pigSay(`여기는 <b>${FULL[stop.region]}</b>! 시장 ${list.length}곳 중 1등은 <b>${top.name}</b>(${top.tier}티어)야. 대표 먹거리는 ${top.signature}. ${list[1] ? `2등은 ${list[1].name}!` : ""}`);
    if (auto) autoTimer = setTimeout(() => go(idx + 1), 7500);
  }

  function leaveTo(m) { close(); openMarket(m); }

  function setFree(on) {
    free = on; el.classList.toggle("free", on);
    clearTimeout(autoTimer); move = null; card.classList.add("hide");
    clearParks(); hideInfo(); nearM = null;
    if (on) {
      if (map.getLevel() > 6) map.setLevel(5, {animate: true});
      pigSay("자유 비행! <b>방향키·WASD</b>(휴대폰은 아래 버튼)로 날 몰아 줘. 시장 가까이 가면 알려 줄게.");
    }
  }

  addEventListener("keydown", e => {
    if (!running) return;
    const k = e.key.toLowerCase();
    if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)) {
      if (!free) setFree(true);
      keys[k] = true; e.preventDefault();
    }
    if (k === "escape") close();
    if (k === "enter" && free && nearM) leaveTo(nearM);
  });
  addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  el.querySelectorAll("[data-key]").forEach(b => {
    const k = b.dataset.key;
    const on = e => { e.preventDefault(); if (!free) setFree(true); keys[k] = true; };
    const off = () => keys[k] = false;
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off);
  });

  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    let targetRun = 0, targetLift = 0;

    if (move) {
      move.k = Math.min(1, move.k + dt / move.dur);
      targetRun = 1;
      if (move.k > 0) {  // k < 0 동안은 지도가 축소되기를 기다린다
        const e = move.k < .5 ? 2 * move.k * move.k : 1 - Math.pow(-2 * move.k + 2, 2) / 2;
        map.setCenter(ll(move.from[0] + (move.to[0] - move.from[0]) * e, move.from[1] + (move.to[1] - move.from[1]) * e));
        targetLift = Math.sin(Math.PI * move.k) * move.lift;
      }
      if (move.k >= 1) { move = null; arrive(); }
    } else if (free) {
      // 화면 기준으로 움직인다: ▲ = 북쪽(위), ▶ = 동쪽(오른쪽)
      const vx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
      const vy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
      const proj = map.getProjection(), c = proj.containerPointFromCoords(map.getCenter());
      if (vx || vy) {
        const n = Math.hypot(vx, vy), step = MOVE_PX * dt;
        heading = Math.atan2(vx, vy);
        map.setCenter(proj.coordsFromContainerPoint(new K.Point(c.x + vx / n * step, c.y + vy / n * step)));
        targetRun = 1; targetLift = .35;
      }
      // 가까운 시장 알려 주기: 돼지 주변 화면 90px 안
      const ctr = map.getCenter(), edge = proj.coordsFromContainerPoint(new K.Point(c.x + 90, c.y));
      const R = meters(ctr.getLat(), ctr.getLng(), edge.getLat(), edge.getLng());
      let best = null, bd = R;
      for (const m of markets) { const d = meters(ctr.getLat(), ctr.getLng(), m.lat, m.lon); if (d < bd) { bd = d; best = m; } }
      if (best !== nearM) {
        nearM = best;
        if (best) {
          const nP = parkOf(best).length;
          near.innerHTML = `<b class="tier-fg-${best.tier}">${best.tier}</b> ${best.name} · ${best.signature}${nP ? ` · 🅿️ ${nP}곳` : ""} <button>보기 (Enter)</button>`;
          near.querySelector("button").onclick = () => leaveTo(best);
          near.classList.remove("hide");
          showParks(best); showInfo(best);
          pigSay(`<b>${best.name}</b> 도착! ${best.tier}티어, ${best.signature} 맛집이 있어.${nP ? ` 파란 P가 주차장이야!` : ""}`);
        } else { near.classList.add("hide"); clearParks(); hideInfo(); }
      }
    }
    if (!free) near.classList.add("hide");

    let hop = 0;
    if (hopT >= 0) { hopT += dt; const k = hopT / .5; hop = Math.max(0, Math.sin(Math.min(k, 1) * Math.PI)) * 1.2; if (k >= 1) hopT = -1; }
    lift += (targetLift - lift) * Math.min(1, dt * (move ? 20 : 6));
    const y = lift + hop;
    pig.root.position.y = y;
    shadow.scale.setScalar(Math.max(.35, 1 - y * .3));
    shadow.material.opacity = Math.max(.12, .35 - y * .1);
    run += (targetRun - run) * Math.min(1, dt * 8);
    pig.root.rotation.y += (((heading - pig.root.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 8);
    pig.animate(t, {run, talking: performance.now() < (window.pigTalkUntil || 0)});
    renderer.render(scene, camera);
  }

  function open() {
    el.classList.remove("hidden"); document.body.classList.add("touring");
    if (!built) build();  // 지도는 보이는 상태에서 만들어야 크기를 제대로 잡는다
    resize(); running = true; clock.getDelta();
    renderer.setAnimationLoop(frame);
    if (idx < 0) setTimeout(() => go(0), 900); else if (!free) arrive();
  }
  function close() {
    running = false; clearTimeout(autoTimer); move = null;
    if (renderer) renderer.setAnimationLoop(null);
    el.classList.add("hidden"); document.body.classList.remove("touring");
  }

  el.querySelector(".t-prev").onclick = () => go(idx - 1);
  el.querySelector(".t-next").onclick = () => go(idx + 1);
  const autoBtn = el.querySelector(".t-auto");
  autoBtn.onclick = () => {
    auto = !auto; autoBtn.textContent = auto ? "⏸ 자동" : "▶ 자동";
    if (auto && !move && !free) go(idx + 1); else clearTimeout(autoTimer);
  };
  el.querySelector(".t-free").onclick = () => free ? go(Math.max(idx, 0)) : setFree(true);
  el.querySelector(".t-close").onclick = close;
  return {open, close};
};
