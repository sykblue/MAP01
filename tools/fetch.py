"""소상공인 상가(상권)정보 API로 시장 주변 음식점을 받아 티어를 매긴다.

사용: python tools/fetch.py   (키는 .env의 SDSC_KEY)
결과: data/markets.json, data.js
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from markets_seed import MARKETS  # noqa: E402

API = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius"
SEARCH_RADIUS = 700   # 시장 위치를 다시 잡기 위해 넓게 받는 반경(m)
SCORE_RADIUS = 300    # 점수 계산 반경(m)
CACHE = ROOT / "tools" / ".cache"
CACHE.mkdir(parents=True, exist_ok=True)

CITY_PREFIX = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "춘천", "원주", "강릉",
               "청주", "충주", "제천", "천안", "전주", "군산", "익산", "목포", "여수", "순천", "경주",
               "안동", "진주", "통영", "제주", "안양", "용인", "의정부", "동두천", "광명", "구리",
               "삼척", "영월", "홍천", "양양", "횡성", "단양", "보은", "영동", "진천", "부여", "대천",
               "서산", "당진", "홍성", "예산", "태안", "금산", "남원", "김제", "부안", "고창", "순창",
               "담양", "해남", "완도", "영광", "상주", "영천", "의성", "영덕", "경산", "밀양", "양산",
               "남해", "거창", "함양", "정선", "평창", "봉평", "온양", "정남진장흥", "점촌", "목사"]


def load_key():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("SDSC_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("SDSC_KEY가 .env에 없습니다")


KEY = load_key()


def call(cx, cy, radius, page):
    cache = CACHE / f"{cy:.4f}_{cx:.4f}_{radius}_{page}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    url = (f"{API}?serviceKey={KEY}&pageNo={page}&numOfRows=1000&radius={radius}"
           f"&cx={cx}&cy={cy}&indsLclsCd=I2&type=json")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except Exception as e:  # 네트워크·일시 오류는 잠시 쉬고 다시
            print(f"   재시도 {attempt + 1}: {e}")
            time.sleep(2 + attempt * 3)
    else:
        return {"header": {"resultCode": "ERR"}, "body": {"items": [], "totalCount": 0}}
    cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.15)
    return data


def fetch_all(cx, cy, radius):
    items, page = [], 1
    while True:
        d = call(cx, cy, radius, page)
        code = d.get("header", {}).get("resultCode")
        if code not in ("00", None):
            break  # 03 = 데이터 없음
        body = d.get("body") or {}
        got = body.get("items") or []
        items += got
        total = int(body.get("totalCount") or 0)
        if len(items) >= total or not got:
            break
        page += 1
    return items


def dist(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def keys_for(name):
    keys = {name}
    for p in CITY_PREFIX:
        if name.startswith(p) and len(name) - len(p) >= 3:
            keys.add(name[len(p):])
    keys |= {k.replace("전통", "").replace("종합", "") for k in list(keys)}
    return {k for k in keys if len(k) >= 3}


def is_match(store, keys):
    text = (store.get("bldNm") or "") + "|" + (store.get("bizesNm") or "")
    return any(k in text for k in keys)


def median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2]


FRANCHISE = re.compile(r"(점|지점)$")


GEO_CACHE = CACHE / "geo.json"
GEO = json.loads(GEO_CACHE.read_text(encoding="utf-8")) if GEO_CACHE.exists() else {}


def geocode(name, lat, lon):
    """OpenStreetMap(Nominatim)에서 시장 이름을 찾아 시드 좌표 20km 안의 가장 가까운 결과를 쓴다."""
    if name not in GEO:
        d = 0.25
        q = urllib.parse.urlencode({"q": name, "format": "json", "limit": 10, "countrycodes": "kr",
                                    "viewbox": f"{lon - d},{lat + d},{lon + d},{lat - d}", "bounded": 1})
        req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{q}",
                                     headers={"User-Agent": "market-tier-local/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                GEO[name] = json.loads(r.read().decode("utf-8"))
        except Exception as e:
            print("   지오코딩 실패:", e)
            GEO[name] = []
        GEO_CACHE.write_text(json.dumps(GEO, ensure_ascii=False), encoding="utf-8")
        time.sleep(1.1)  # Nominatim 이용 규칙: 초당 1회
    best = None
    for g in GEO[name]:
        d = dist(lat, lon, float(g["lat"]), float(g["lon"]))
        if d < 20000 and (best is None or d < best[0]):
            best = (d, float(g["lat"]), float(g["lon"]))
    return (best[1], best[2]) if best else (lat, lon)


def analyze(seed):
    name, region, lat, lon, signature = seed
    lat, lon = geocode(name, lat, lon)
    stores = fetch_all(lon, lat, SEARCH_RADIUS)
    keys = keys_for(name)
    matched = [s for s in stores if is_match(s, keys)]
    located = len(matched) >= 3
    if located:
        lat = median([float(s["lat"]) for s in matched])
        lon = median([float(s["lon"]) for s in matched])

    near = []
    for s in stores:
        d = dist(lat, lon, float(s["lat"]), float(s["lon"]))
        if d <= SCORE_RADIUS:
            s["_d"] = d
            s["_in"] = is_match(s, keys)
            near.append(s)

    food = len(near)
    inside = sum(1 for s in near if s["_in"])
    local = [s for s in near if not (s.get("brchNm") or "").strip()]
    local_ratio = len(local) / food if food else 0
    scls = Counter(s.get("indsSclsNm") or "기타" for s in near)
    mcls = Counter(s.get("indsMclsNm") or "기타" for s in near)

    # 대표 가게: 시장 안 · 비프랜차이즈 우선, 소분류가 겹치지 않게, 가까운 순
    pool = sorted(local, key=lambda s: (not s["_in"], s["_d"]))
    picks, seen = [], Counter()
    for s in pool:
        c = s.get("indsSclsNm") or "기타"
        if seen[c] >= 2:
            continue
        seen[c] += 1
        picks.append({
            "n": s.get("bizesNm"),
            "c": c,
            "a": s.get("rdnmAdr") or s.get("lnoAdr"),
            "f": s.get("flrNo") or "",
            "lat": round(float(s["lat"]), 6),
            "lon": round(float(s["lon"]), 6),
            "in": s["_in"],
        })
        if len(picks) >= 10:
            break

    sido = near[0].get("ctprvnNm") if near else ""
    sgg = near[0].get("signguNm") if near else ""
    return {
        "name": name, "region": region, "sido": sido, "sgg": sgg,
        "lat": round(lat, 6), "lon": round(lon, 6), "located": located or (lat, lon) != seed[2:4],
        "signature": signature, "food": food, "inside": inside,
        "localRatio": round(local_ratio, 3), "variety": len(scls),
        "topCats": [[k, v] for k, v in mcls.most_common(5)],
        "picks": picks,
    }


def norm(vals):
    lo, hi = min(vals), max(vals)
    return [(v - lo) / (hi - lo) if hi > lo else 0 for v in vals]


def main():
    out = []
    for i, seed in enumerate(MARKETS, 1):
        m = analyze(seed)
        print(f"[{i:3}/{len(MARKETS)}] {m['name']:<12} 음식점 {m['food']:4}  시장안 {m['inside']:4}  "
              f"{'위치보정' if m['located'] else '대략위치'}", flush=True)
        out.append(m)
    dropped = [m["name"] for m in out if m["food"] < 5]  # 좌표를 못 잡은 곳은 티어에서 뺀다
    out = [m for m in out if m["food"] >= 5]
    print("제외(음식점 5곳 미만):", dropped)

    f1 = norm([math.log1p(m["food"]) for m in out])
    f2 = norm([math.log1p(m["inside"]) for m in out])
    f3 = norm([m["variety"] for m in out])
    f4 = norm([m["localRatio"] for m in out])
    for m, a, b, c, d in zip(out, f1, f2, f3, f4):
        m["score"] = round(100 * (0.35 * a + 0.30 * b + 0.20 * c + 0.15 * d), 1)

    out.sort(key=lambda m: -m["score"])
    cuts = [("S", 0.08), ("A", 0.25), ("B", 0.55), ("C", 0.85), ("D", 1.01)]
    for rank, m in enumerate(out, 1):
        m["rank"] = rank
        m["tier"] = next(t for t, p in cuts if rank <= math.ceil(p * len(out)))

    (ROOT / "data").mkdir(exist_ok=True)
    meta = {"stdrYm": "", "count": len(out), "radius": SCORE_RADIUS}
    probe = next(iter(CACHE.glob("*.json")), None)
    if probe:
        meta["stdrYm"] = json.loads(probe.read_text(encoding="utf-8")).get("header", {}).get("stdrYm", "")
    payload = {"meta": meta, "markets": out}
    (ROOT / "data" / "markets.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "data.js").write_text("window.MARKET_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n",
                                  encoding="utf-8")
    print("완료:", len(out), "곳")


if __name__ == "__main__":
    main()
