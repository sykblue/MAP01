// 티어 정보와 메달 SVG. index.html(티어표)과 main.html(랜딩)이 함께 쓴다.
// file://로 열어도 되도록 일반 스크립트로 둔다.

// [티어, 설명, 메달 등급]
const TIERS = [["S","무조건 가라","KING"],["A","강력 추천","DIAMOND"],["B","가볼 만함","PLATINUM"],["C","동네 맛","GOLD"],["D","소소함","SILVER"]];

// 티어 메달 (SVG). D 실버 → C 골드 → B 플래티넘 → A 다이아 → S 킹
const MEDAL = {
  D: {sides:6, rib:["#c9d6f0","#ffffff"], body:["#f2f5ff","#9fb1d8"], rim:"#7d8fbf", inner:["#c3d0ee","#6c80b3"], label:["#8fa2cf","#56699a"]},
  C: {sides:8, rib:["#ffc93d","#ffffff"], body:["#fff1a8","#f5a623"], rim:"#d98a12", inner:["#ffa046","#e0601d"], label:["#ff8a2a","#c94c0c"]},
  B: {sides:7, rib:["#8b6cf6","#ffffff"], body:["#e9e7ff","#8f8cf0"], rim:"#6d6ad8", inner:["#7d7cff","#3d3ccf"], label:["#8b5cf6","#5326c0"], laurel:"#6a4be0"},
  A: {sides:6, rib:["#e8264f","#ffffff"], body:["#ffe6ee","#ff9ab8"], rim:"#e0567f", inner:["#ff7aa2","#d81b55"], label:["#ff3d6e","#b80f3a"], laurel:"#e8902a", wing:"#ffd3e0"},
  S: {sides:6, rib:["#e8202f","#ffffff"], body:["#fff3b0","#f5a524"], rim:"#d4850f", inner:["#ff5a4a","#b80d24"], label:["#e8202f","#9c0b19"], laurel:"#c97a0a", wing:"#ffe4a8"},
};
let medalN = 0;
const ngon = (n, r, cx = 70, cy = 82) => Array.from({length:n}, (_, i) => { const a = Math.PI * 2 * i / n - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
const starPts = (n, R, r, cx = 70, cy = 80) => Array.from({length:n * 2}, (_, i) => { const a = Math.PI * i / n - Math.PI / 2, k = i % 2 ? r : R; return `${(cx + k * Math.cos(a)).toFixed(1)},${(cy + k * Math.sin(a)).toFixed(1)}`; }).join(" ");
// 화면에 쓰는 티어 표시: 평평한 사각 배지 (티어 색은 style.css의 .tier-bg-*)
function medalSVG(t) {
  return `<span class="medal tier-bg-${t}" aria-hidden="true">${t}</span>`;
}

// 예전 게임풍 메달 그림. 지금 화면에서는 쓰지 않지만 필요할 때 다시 쓸 수 있게 둔다
function medalArtSVG(t) {
  const c = MEDAL[t], id = "md" + (medalN++), g = (k, [a, b]) => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const u = k => `url(#${id}${k})`;
  const wing = `<g fill="${c.wing}" stroke="#fff" stroke-width="1.5"><path d="M30,64 C10,56 2,38 6,26 C14,42 22,50 34,54Z"/><path d="M30,78 C8,74 0,58 2,46 C12,60 22,66 32,68Z"/><path d="M32,92 C14,92 6,80 6,70 C16,80 24,84 34,84Z"/></g>`;
  const leaves = Array.from({length:4}, (_, i) => { const a = (125 + i * 18) * Math.PI / 180, x = 70 + 34 * Math.cos(a), y = 82 + 34 * Math.sin(a); return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="2.6" transform="rotate(${(125 + i * 18 + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }).join("");
  const laurel = `<g fill="${c.laurel}">${leaves}</g>`;
  const mirror = s => `${s}<g transform="translate(140,0) scale(-1,1)">${s}</g>`;
  const emblem = {
    D: `<polygon points="${starPts(4, 26, 7)}" fill="${u("e")}" stroke="#fff" stroke-width="1.5"/>`,
    C: `<polygon points="${starPts(8, 26, 12)}" fill="${u("e")}" stroke="#fff3c2" stroke-width="1.5"/>`,
    B: `<polygon points="${starPts(5, 26, 11)}" fill="${u("e")}" stroke="#fff" stroke-width="1.5"/><circle cx="70" cy="81" r="6" fill="#dfe8ff"/>`,
    A: `<polygon points="56,70 84,70 93,79 70,102 47,79" fill="${u("e")}" stroke="#fff" stroke-width="1.5"/><path d="M47,79H93M56,70 62,79 70,70 78,79 84,70M62,79 70,102 78,79" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>`,
    S: `<polygon points="58,64 60,53 65,59 70,50 75,59 80,53 82,64" fill="#ffd84d" stroke="#fff" stroke-width="1.2"/><path d="M57,67H83V75A13,13 0 0 1 57,75Z" fill="${u("e")}" stroke="#fff" stroke-width="1.5"/><path d="M57,70H51A6,6 0 0 0 57,80M83,70H89A6,6 0 0 1 83,80" fill="none" stroke="#ffd84d" stroke-width="2.5"/><rect x="67" y="88" width="6" height="6" fill="#ffd84d"/><rect x="60" y="94" width="20" height="5" rx="2" fill="#ffd84d"/><polygon points="${starPts(5, 5, 2.2, 70, 75)}" fill="#fff"/>`,
  }[t];
  const eGrad = {D:["#ffffff","#a9bbe4"], C:["#fff3c2","#ff5a1f"], B:["#dbe6ff","#3b63e6"], A:["#ffd0de","#e0245e"], S:["#ffe58a","#e09a12"]}[t];
  const name = TIERS.find(x => x[0] === t)[2];
  return `<svg class="medal" viewBox="0 0 140 150" aria-hidden="true"><defs>${g("b", c.body)}${g("i", c.inner)}${g("l", c.label)}${g("e", eGrad)}</defs>
    <rect x="56" y="4" width="28" height="20" fill="${c.rib[0]}"/>${[0,1,2].map(i => `<rect x="${60 + i * 8}" y="4" width="4" height="20" fill="${c.rib[1]}"/>`).join("")}
    <polygon points="54,22 86,22 79,34 61,34" fill="#ffd76a"/>
    ${c.wing ? mirror(wing) : ""}
    <polygon points="${ngon(c.sides, 46)}" fill="${u("b")}" stroke="${c.rim}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="70" cy="82" r="29" fill="${u("i")}" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>
    ${c.laurel ? mirror(laurel) : ""}
    ${emblem}
    <ellipse cx="62" cy="58" rx="22" ry="9" fill="#fff" opacity=".25"/>
    <rect x="30" y="113" width="80" height="20" rx="10" fill="${u("l")}" stroke="#fff" stroke-opacity=".8" stroke-width="1.5"/>
    <text x="70" y="127.5" text-anchor="middle" font-size="11" font-weight="800" letter-spacing="1" fill="#fff" font-family="system-ui,sans-serif">${name}</text>
  </svg>`;
}
