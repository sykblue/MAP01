// 3D 돼지 투어: 시·도 입체 지도 위를 돼지가 뛰어다니며 지역별 1등 시장을 안내한다 (3인칭 카메라).
window.initTour = function (THREE, api) {
  const {markets, geo, tierColor, pigSay, openMarket} = api;
  const ORDER = ["서울","인천","경기","강원","충북","세종","대전","충남","전북","광주","전남","제주","경남","부산","울산","대구","경북"];
  const FULL = {"서울":"서울특별시","인천":"인천광역시","경기":"경기도","강원":"강원도","충북":"충청북도","세종":"세종특별자치시",
    "대전":"대전광역시","충남":"충청남도","전북":"전라북도","광주":"광주광역시","전남":"전라남도","제주":"제주특별자치도",
    "경남":"경상남도","부산":"부산광역시","울산":"울산광역시","대구":"대구광역시","경북":"경상북도"};
  const SHORT = Object.fromEntries(Object.entries(FULL).map(([k, v]) => [v, k]));
  const IS_DO = r => FULL[r].endsWith("도");
  const STOPS = ORDER.map(r => ({region: r, list: markets.filter(m => m.region === r)})).filter(s => s.list.length);

  // 경위도 → 장면 좌표 (x: 동쪽, z: 남쪽)
  const CX = 127.8, CY = 36.2, K = 40, COS = Math.cos(CY * Math.PI / 180), LAND = .8;
  const px = lon => (lon - CX) * K * COS, pz = lat => -(lat - CY) * K;

  const el = document.getElementById("tour");
  const canvas = el.querySelector("canvas");
  const card = el.querySelector(".tour-card");
  const near = el.querySelector(".tour-near");
  const dots = el.querySelector(".tour-dots");
  let renderer, scene, camera, pig, sun, built = false, running = false;

  function label(text, color = "#fff4e6", size = 64) {
    const c = document.createElement("canvas"), x = c.getContext("2d");
    x.font = `${size}px "Black Han Sans", sans-serif`;
    c.width = Math.ceil(x.measureText(text).width) + 24; c.height = size + 24;
    x.font = `${size}px "Black Han Sans", sans-serif`;
    x.lineWidth = 10; x.strokeStyle = "rgba(27,20,18,.9)"; x.strokeText(text, 12, size);
    x.fillStyle = color; x.fillText(text, 12, size);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), depthWrite: false, sizeAttenuation: false}));
    s.scale.set(c.width / c.height * .045, .045, 1);
    return s;
  }

  function build() {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaf4fb);
    scene.fog = new THREE.Fog(0xeaf4fb, 60, 220);
    camera = new THREE.PerspectiveCamera(50, 1, .1, 600);
    camera.position.set(0, 160, 140);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb3c7, 1.2));
    sun = new THREE.DirectionalLight(0xffe2c0, 1.8);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120});
    scene.add(sun, sun.target);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({color: 0x9cc9e0, roughness: .9}));
    sea.rotation.x = -Math.PI / 2; sea.receiveShadow = true; scene.add(sea);

    const PALETTE = [0xc9a27a, 0xb98f64, 0xd6b48c, 0xa9875f, 0xceb18a, 0xbf9a6e];
    geo.features.forEach((f, i) => {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      const short = SHORT[f.properties.name];
      const mat = new THREE.MeshStandardMaterial({color: PALETTE[i % PALETTE.length], roughness: .85});
      let big = null, bigN = 0;
      polys.forEach(poly => {
        const ring = poly[0];
        if (ring.length < 4) return;
        const shape = new THREE.Shape(ring.map(([lo, la]) => new THREE.Vector2(px(lo), -pz(la))));
        const g = new THREE.ExtrudeGeometry(shape, {depth: LAND, bevelEnabled: false});
        g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
        if (ring.length > bigN) { bigN = ring.length; big = ring; }
      });
      if (big && short) {
        const cx = big.reduce((s, p) => s + p[0], 0) / big.length, cy = big.reduce((s, p) => s + p[1], 0) / big.length;
        const l = label(short, "#fff4e6", 64); l.scale.multiplyScalar(1.3);
        if (!IS_DO(short)) l.scale.multiplyScalar(.75);
        l.position.set(px(cx), 9, pz(cy)); scene.add(l);
      }
    });

    // 땅 윗면: 간소화된 경계선은 꼬인 곳이 있어 3D 삼각분할에서 구멍이 나므로, 2D 캔버스로 칠해 덮는다
    const X0 = px(124.4), X1 = px(132), Z0 = pz(38.9), Z1 = pz(32.9);
    const W = 4096, H = Math.round(W * (Z1 - Z0) / (X1 - X0));
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const u = lo => (px(lo) - X0) / (X1 - X0) * W, v = la => (pz(la) - Z0) / (Z1 - Z0) * H;
    geo.features.forEach((f, i) => {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      ctx.beginPath();
      polys.forEach(poly => poly.forEach(ring => ring.forEach(([lo, la], k) => k ? ctx.lineTo(u(lo), v(la)) : ctx.moveTo(u(lo), v(la)))));
      ctx.fillStyle = "#" + PALETTE[i % PALETTE.length].toString(16).padStart(6, "0");
      ctx.fill("evenodd");
      ctx.strokeStyle = "#5a3b26"; ctx.lineWidth = 3; ctx.stroke();
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0),
      new THREE.MeshStandardMaterial({map: tex, alphaTest: .5, transparent: true, roughness: .85}));
    top.rotation.x = -Math.PI / 2; top.position.set((X0 + X1) / 2, LAND + .01, (Z0 + Z1) / 2);
    top.receiveShadow = true; scene.add(top);

    // 시장 기둥: 높이 = 점수, 색 = 티어. S·A 티어에는 등불
    markets.forEach(m => {
      const h = .4 + m.score / 45;
      const col = new THREE.Color(tierColor[m.tier]);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, h, 10), new THREE.MeshStandardMaterial({color: col, roughness: .5}));
      p.position.set(px(m.lon), LAND + h / 2, pz(m.lat)); p.castShadow = true; scene.add(p);
      if (m.tier === "S" || m.tier === "A") {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.24, 14, 10), new THREE.MeshStandardMaterial({color: col, emissive: col, emissiveIntensity: .9}));
        lamp.position.set(p.position.x, LAND + h + .24, p.position.z); scene.add(lamp);
      }
      m._pos = new THREE.Vector3(p.position.x, LAND, p.position.z);
    });
    STOPS.forEach(s => {
      const top = s.list[0];
      const l = label(top.name, tierColor[top.tier], 48); l.scale.multiplyScalar(.7);
      l.position.copy(top._pos).add(new THREE.Vector3(0, 3.2 + top.score / 45, 0)); scene.add(l);
    });

    pig = buildPig(THREE);
    pig.root.scale.setScalar(.9);
    const start = STOPS[0].list[0]._pos;
    pig.root.position.set(start.x - 3, LAND, start.z + 3);
    scene.add(pig.root);

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
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }

  // 이동 상태
  let idx = -1, move = null, auto = true, autoTimer = null, free = false;
  const keys = {};
  let heading = 0, run = 0, hopT = -1;

  function go(i) {
    free = false; el.classList.remove("free");
    clearTimeout(autoTimer);
    idx = (i + STOPS.length) % STOPS.length;
    const stop = STOPS[idx], top = stop.list[0];
    const from = pig.root.position.clone(); from.y = LAND;
    // 기둥 바로 앞에서 멈춰서 카메라가 돼지 어깨 너머로 시장을 보게 한다
    const dir = top._pos.clone().sub(from).setY(0);
    const to = dir.length() > 3 ? top._pos.clone().sub(dir.normalize().multiplyScalar(2.6)) : top._pos.clone().add(new THREE.Vector3(0, 0, -2.6));
    const d = from.distanceTo(to);
    const JEJU_Z = pz(33.9);  // 이보다 남쪽이면 제주: 바다를 건너 크게 점프
    const sea = (to.z > JEJU_Z) !== (from.z > JEJU_Z);
    move = {from, to, k: 0, dur: Math.max(1.2, d / 32), arc: sea ? 14 : Math.min(2, d / 40)};
    [...dots.children].forEach((b, j) => b.classList.toggle("on", j === idx));
    card.classList.add("hide");
    pigSay(`${FULL[stop.region]}(으)로 출발~ 꿀꿀! 🐷💨`);
  }

  function arrive() {
    const stop = STOPS[idx], list = stop.list, top = list[0];
    const counts = ["S","A","B","C","D"].map(t => [t, list.filter(m => m.tier === t).length]).filter(([, n]) => n);
    card.innerHTML = `
      <div class="tc-head"><span>${idx + 1} / ${STOPS.length}</span><h3>${FULL[stop.region]}</h3></div>
      <div class="tc-tiers">${counts.map(([t, n]) => `<span style="background:${tierColor[t]}">${t} ${n}</span>`).join("")}</div>
      <ol>${list.slice(0, 3).map(m => `<li data-n="${m.name}"><b>${m.name}</b> <i style="color:${tierColor[m.tier]}">${m.tier}</i><small>${m.signature}</small></li>`).join("")}</ol>
      <button class="tc-go">🐽 ${top.name} 맛집 로드뷰 보기</button>`;
    card.querySelectorAll("li").forEach(li => li.onclick = () => leaveTo(list.find(m => m.name === li.dataset.n)));
    card.querySelector(".tc-go").onclick = () => leaveTo(top);
    card.classList.remove("hide");
    hopT = 0;
    pigSay(`여기는 <b>${FULL[stop.region]}</b>! 시장 ${list.length}곳 중 1등은 <b>${top.name}</b>(${top.tier}티어)야. 대표 먹거리는 ${top.signature}. ${list[1] ? `2등은 ${list[1].name}!` : ""}`);
    if (auto) autoTimer = setTimeout(() => go(idx + 1), 7500);
  }

  function leaveTo(m) { close(); openMarket(m); }

  function setFree(on) {
    free = on; el.classList.toggle("free", on);
    clearTimeout(autoTimer); move = null; card.classList.add("hide");
    if (on) pigSay("자유 이동! <b>방향키·WASD</b>(휴대폰은 아래 버튼)로 날 몰아 줘. 기둥 가까이 가면 시장을 알려 줄게.");
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

  let nearM = null;
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();

  function frame() {
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    const P = pig.root.position;
    let targetRun = 0, base = LAND;

    if (move) {
      move.k = Math.min(1, move.k + dt / move.dur);
      const e = move.k < .5 ? 2 * move.k * move.k : 1 - Math.pow(-2 * move.k + 2, 2) / 2;
      P.lerpVectors(move.from, move.to, e);
      base = LAND + Math.sin(Math.PI * move.k) * move.arc;
      tmp.subVectors(move.to, move.from);
      heading = Math.atan2(tmp.x, tmp.z);
      targetRun = 1;
      if (move.k >= 1) { move = null; arrive(); }
    } else if (free) {
      const f = (keys.arrowup || keys.w ? 1 : 0) - (keys.arrowdown || keys.s ? 1 : 0);
      const r = (keys.arrowleft || keys.a ? 1 : 0) - (keys.arrowright || keys.d ? 1 : 0);
      heading += r * dt * 2.6;
      if (f) {
        P.x = Math.max(-140, Math.min(140, P.x + Math.sin(heading) * f * 22 * dt));
        P.z = Math.max(-150, Math.min(150, P.z + Math.cos(heading) * f * 22 * dt));
        targetRun = 1;
      }
      // 가까운 시장 알려 주기
      let best = null, bd = 4;
      for (const m of markets) { const d = Math.hypot(m._pos.x - P.x, m._pos.z - P.z); if (d < bd) { bd = d; best = m; } }
      if (best !== nearM) {
        nearM = best;
        if (best) {
          near.innerHTML = `<b style="color:${tierColor[best.tier]}">${best.tier}</b> ${best.name} · ${best.signature} <button>보기 (Enter)</button>`;
          near.querySelector("button").onclick = () => leaveTo(best);
          near.classList.remove("hide");
          pigSay(`<b>${best.name}</b> 도착! ${best.tier}티어, ${best.signature} 맛집이 있어.`);
        } else near.classList.add("hide");
      }
    }
    if (!free) near.classList.add("hide");

    let hop = 0;
    if (hopT >= 0) { hopT += dt; const k = hopT / .5; hop = Math.max(0, Math.sin(Math.min(k, 1) * Math.PI)) * 1.2; if (k >= 1) hopT = -1; }
    P.y = base + hop;
    run += (targetRun - run) * Math.min(1, dt * 8);
    pig.root.rotation.y += (((heading - pig.root.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, dt * 8);
    pig.animate(t, {run, talking: performance.now() < (window.pigTalkUntil || 0)});

    // 3인칭 카메라: 돼지 뒤 위쪽에서 따라감, 멀리 뛸 땐 조금 멀어짐
    const back = 9 + run * 6 + (move ? move.arc * .8 : 0), up = 7 + run * 4 + (move ? move.arc * .6 : 0);
    const yaw = pig.root.rotation.y;
    tmp.set(P.x - Math.sin(yaw) * back, P.y + up, P.z - Math.cos(yaw) * back);
    camera.position.lerp(tmp, Math.min(1, dt * 2.5));
    camera.lookAt(P.x + Math.sin(yaw) * 4, P.y + 1.5, P.z + Math.cos(yaw) * 4);
    sun.position.set(P.x + 15, P.y + 40, P.z + 10); sun.target.position.copy(P);

    renderer.render(scene, camera);
  }

  function open() {
    if (!built) build();
    el.classList.remove("hidden"); document.body.classList.add("touring");
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
