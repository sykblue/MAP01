// 꿀돼지 3D 모델. 안내 돼지(구석)와 3D 투어가 함께 쓴다.
// file://로 열어도 되도록 모듈이 아닌 일반 스크립트로 두고, THREE는 인자로 받는다.
// 생김새: 큰 머리 + 작은 몸으로 두 발로 선 말랑한 피규어 느낌
window.buildPig = function (THREE) {
  const pink = new THREE.MeshStandardMaterial({color:0xffc6d2, roughness:.7});
  const deep = new THREE.MeshStandardMaterial({color:0xff9db3, roughness:.6});
  const inner = new THREE.MeshStandardMaterial({color:0xff8aa6, roughness:.7});
  const eyeM = new THREE.MeshStandardMaterial({color:0x2a1d22, roughness:.12, metalness:.1});
  const shine = new THREE.MeshBasicMaterial({color:0xffffff});
  const nose = new THREE.MeshStandardMaterial({color:0xd94a68, roughness:.6});
  const blush = new THREE.MeshBasicMaterial({color:0xff7f9c, transparent:true, opacity:.35, depthWrite:false});
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };

  const root = new THREE.Group();          // 위치·방향 (+z가 앞)
  const fig = new THREE.Group(); fig.scale.setScalar(.8); root.add(fig);
  const bodyG = new THREE.Group(); fig.add(bodyG);

  // 통통한 몸
  const body = mesh(new THREE.SphereGeometry(.5, 32, 24), pink); body.scale.set(1, 1.05, .9); body.position.y = .85; bodyG.add(body);
  const tail = mesh(new THREE.TorusGeometry(.07, .025, 8, 20, Math.PI * 1.6), deep); tail.position.set(0, .75, -.45); tail.rotation.y = Math.PI/2; bodyG.add(tail);

  // 짧은 팔
  const arms = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * .44, 1.1, 0); pivot.rotation.z = s * .5; bodyG.add(pivot);
    const a = mesh(new THREE.CapsuleGeometry(.11, .16, 8, 16), pink); a.position.y = -.17; pivot.add(a);
    pivot.userData.rz = s * .5; return pivot;
  });

  // 큰 머리 (아래쪽 볼살이 더 넓다)
  const head = new THREE.Group(); head.position.y = 1.85; bodyG.add(head);
  const skull = mesh(new THREE.SphereGeometry(.78, 40, 30), pink); skull.scale.set(1.08, .92, .95); head.add(skull);
  const jowl = mesh(new THREE.SphereGeometry(.7, 32, 24), pink); jowl.scale.set(1.15, .7, .95); jowl.position.y = -.22; head.add(jowl);

  // 반짝이는 눈
  const eyes = [-.3, .3].map(x => {
    const e = new THREE.Group(); e.position.set(x, .08, .64); head.add(e);
    e.add(mesh(new THREE.SphereGeometry(.1, 20, 20), eyeM));
    const s = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 10), shine); s.position.set(x > 0 ? -.03 : .03, .04, .085); e.add(s);
    return e;
  });

  // 볼터치
  [-.5, .5].forEach(x => { const b = new THREE.Mesh(new THREE.SphereGeometry(.16, 20, 16), blush); b.position.set(x, -.18, .52); b.scale.set(1, .65, .35); head.add(b); });

  // 코
  const snout = new THREE.Group(); snout.position.set(0, -.1, .74); head.add(snout);
  const sn = mesh(new THREE.CylinderGeometry(.2, .21, .16, 32), deep); sn.rotation.x = Math.PI/2; sn.scale.set(1.3, 1, .85); snout.add(sn);
  [-.08, .08].forEach(x => { const n = mesh(new THREE.SphereGeometry(.03, 12, 12), nose); n.position.set(x, .01, .08); n.scale.set(1, 1.3, .5); snout.add(n); });
  const snoutY = snout.position.y;

  // 뾰족한 귀 (안쪽은 진한 분홍)
  const ears = [-1, 1].map(s => {
    const ear = new THREE.Group(); ear.position.set(s * .55, .6, -.05); ear.rotation.z = -s * .45; head.add(ear);
    const outer = mesh(new THREE.ConeGeometry(.26, .52, 24), pink); outer.scale.z = .4; outer.position.y = .2; ear.add(outer);
    const ins = mesh(new THREE.ConeGeometry(.17, .36, 24), inner); ins.scale.z = .25; ins.position.set(0, .16, .05); ear.add(ins);
    return ear;
  });

  // 두 다리
  const legs = [-.22, .22].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, .42, 0); fig.add(pivot);
    const l = mesh(new THREE.CapsuleGeometry(.15, .2, 8, 16), pink); l.position.y = -.2; l.scale.z = 1.1; pivot.add(l);
    return pivot;
  });

  let blink = 0;
  // run: 0~1 (뛰는 정도), talking: 말하는 중
  function animate(t, {run = 0, talking = false} = {}) {
    bodyG.position.y = Math.sin(t * (run ? 22 : 2)) * (run ? .12 * run : .03);
    bodyG.rotation.x = run * .12;
    snout.position.y = snoutY + (talking ? Math.abs(Math.sin(t * 18)) * .04 : 0);
    ears.forEach((e, i) => e.rotation.x = Math.sin(t * (talking || run ? 12 : 3) + i) * (talking || run ? .25 : .06));
    tail.rotation.x = t * 6;
    const swing = run ? Math.sin(t * 22) * .8 * run : 0;
    legs.forEach((l, i) => l.rotation.x = (i ? -1 : 1) * swing);
    arms.forEach((a, i) => {
      a.rotation.x = (i ? 1 : -1) * swing;
      a.rotation.z = a.userData.rz + (talking ? Math.sin(t * 12 + i * Math.PI) * .25 : 0);
    });
    head.rotation.z = Math.sin(t * 1.3) * .05;
    blink -= 1/60; if (blink < -3 - Math.random() * 3) blink = .12;
    eyes.forEach(e => e.scale.y = blink > 0 ? .1 : 1);
  }
  return {root, head, animate};
};
