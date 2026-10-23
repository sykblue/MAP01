// 꿀돼지 3D 모델. 안내 돼지(구석)와 3D 투어가 함께 쓴다.
// file://로 열어도 되도록 모듈이 아닌 일반 스크립트로 두고, THREE는 인자로 받는다.
window.buildPig = function (THREE) {
  const pink = new THREE.MeshStandardMaterial({color:0xffa3c4, roughness:.55});
  const deep = new THREE.MeshStandardMaterial({color:0xf27aa6, roughness:.5});
  const dark = new THREE.MeshStandardMaterial({color:0x2a1a1f, roughness:.3});
  const white = new THREE.MeshStandardMaterial({color:0xffffff, roughness:.3});
  const red = new THREE.MeshStandardMaterial({color:0xd8343c, roughness:.6});
  const blush = new THREE.MeshStandardMaterial({color:0xff6f9c, transparent:true, opacity:.6});
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };

  const root = new THREE.Group();          // 위치·방향 (+z가 앞)
  const bodyG = new THREE.Group(); root.add(bodyG);
  const body = mesh(new THREE.SphereGeometry(1, 32, 24), pink); body.scale.set(1, .95, 1.15); body.position.y = 1; bodyG.add(body);

  const head = new THREE.Group(); head.position.set(0, 1.55, .95); bodyG.add(head);
  head.add(mesh(new THREE.SphereGeometry(.72, 32, 24), pink));
  const snout = mesh(new THREE.CylinderGeometry(.3, .32, .25, 32), deep); snout.rotation.x = Math.PI/2; snout.position.set(0, -.08, .68); head.add(snout);
  [-.1, .1].forEach(x => { const n = mesh(new THREE.SphereGeometry(.055, 12, 12), dark); n.position.set(x, -.08, .81); n.scale.z = .5; head.add(n); });
  const eyes = [];
  [-.27, .27].forEach(x => {
    const e = mesh(new THREE.SphereGeometry(.11, 16, 16), white); e.position.set(x, .18, .58); head.add(e);
    const p = mesh(new THREE.SphereGeometry(.065, 16, 16), dark); p.position.set(x, .18, .67); head.add(p); eyes.push(e, p);
    const ch = mesh(new THREE.SphereGeometry(.1, 12, 12), blush); ch.position.set(x * 1.6, -.15, .5); ch.scale.set(1, .6, .3); head.add(ch);
  });
  const ears = [-1, 1].map(s => {
    const ear = mesh(new THREE.ConeGeometry(.22, .45, 4), deep); ear.position.set(s * .42, .62, -.05); ear.rotation.z = -s * .45; head.add(ear); return ear;
  });
  const mouth = mesh(new THREE.TorusGeometry(.1, .025, 8, 16, Math.PI), dark); mouth.position.set(0, -.36, .6); mouth.rotation.z = Math.PI; head.add(mouth);
  // 시장 상인 머리띠
  const band = mesh(new THREE.TorusGeometry(.66, .07, 10, 40), red); band.position.y = .32; band.rotation.x = Math.PI/2 - .15; head.add(band);

  const legs = [[-.45,.55],[.45,.55],[-.45,-.55],[.45,-.55]].map(([x,z]) => {
    const pivot = new THREE.Group(); pivot.position.set(x, .55, z); root.add(pivot);
    const l = mesh(new THREE.CylinderGeometry(.17, .15, .55, 16), pink); l.position.y = -.27; pivot.add(l);
    const h = mesh(new THREE.CylinderGeometry(.155, .155, .08, 16), dark); h.position.y = -.27; l.add(h);
    return pivot;
  });
  const tail = mesh(new THREE.TorusGeometry(.13, .04, 8, 24, Math.PI * 1.6), deep); tail.position.set(0, 1.2, -1.12); tail.rotation.y = Math.PI/2; bodyG.add(tail);

  let blink = 0;
  // run: 0~1 (뛰는 정도), talking: 말하는 중
  function animate(t, {run = 0, talking = false} = {}) {
    bodyG.position.y = Math.sin(t * (run ? 22 : 2)) * (run ? .12 * run : .04);
    bodyG.rotation.x = run * .12;
    mouth.scale.y = talking ? 1 + Math.abs(Math.sin(t * 18)) * 1.8 : 1;
    ears.forEach((e, i) => e.rotation.x = Math.sin(t * (talking || run ? 12 : 3) + i) * (talking || run ? .3 : .08));
    tail.rotation.x = t * 6;
    const swing = run ? Math.sin(t * 22) * .8 * run : talking ? Math.sin(t * 12) * .2 : 0;
    legs.forEach((l, i) => l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing);
    head.rotation.z = Math.sin(t * 1.3) * .05;
    blink -= 1/60; if (blink < -3 - Math.random() * 3) blink = .12;
    eyes.forEach(e => e.scale.y = blink > 0 ? .1 : 1);
  }
  return {root, head, animate};
};
