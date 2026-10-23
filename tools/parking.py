"""OpenStreetMap(Overpass)에서 시장 주변 주차장을 받아 parking.js로 저장한다.

사용: python tools/parking.py   (data/markets.json이 먼저 있어야 함, 키 불필요)
결과: parking.js  (window.PARKING_DATA = {"지역 시장이름": [주차장, ...]})
"""
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://overpass-api.de/api/interpreter"
RADIUS = 600   # 시장 중심에서 찾는 반경(m)
LIMIT = 6      # 시장마다 남길 주차장 수
BATCH = 25     # 한 번에 묻는 시장 수
CACHE = ROOT / "tools" / ".cache" / "parking"
CACHE.mkdir(parents=True, exist_ok=True)

KIND = {"underground": "지하", "multi-storey": "주차빌딩", "surface": "노상·노외", "street_side": "노상"}


def dist(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def cache_of(m):
    return CACHE / f"{m['lat']:.4f}_{m['lon']:.4f}_{RADIUS}.json"


def center(e):
    c = e.get("center") or e
    return (float(c["lat"]), float(c["lon"])) if "lat" in c else None


def fetch_batch(ms):
    """공용 서버가 연속 요청을 막으므로 시장 여러 곳을 한 번에 묻고, 결과를 시장별 캐시로 나눠 저장한다."""
    arounds = "".join(f'nwr["amenity"="parking"](around:{RADIUS},{m["lat"]},{m["lon"]});' for m in ms)
    q = f"[out:json][timeout:120];({arounds});out center tags;"
    req = urllib.request.Request(API, data=urllib.parse.urlencode({"data": q}).encode(),
                                 headers={"User-Agent": "market-tier-local/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                elements = json.loads(r.read().decode("utf-8")).get("elements", [])
            break
        except Exception as e:  # 429·타임아웃은 잠시 쉬고 다시
            print(f"   재시도 {attempt + 1}: {e}", flush=True)
            time.sleep(10 + attempt * 20)
    else:
        return False
    for m in ms:
        mine = [e for e in elements if (c := center(e)) and dist(m["lat"], m["lon"], *c) <= RADIUS]
        cache_of(m).write_text(json.dumps({"elements": mine}, ensure_ascii=False), encoding="utf-8")
    return True


def lots(m):
    out = []
    cache = cache_of(m)
    elements = json.loads(cache.read_text(encoding="utf-8")).get("elements", []) if cache.exists() else []
    for e in elements:
        t = e.get("tags", {})
        if t.get("access") in ("private", "no", "customers", "permissive"):
            continue  # 일반인이 못 쓰는 곳은 뺀다
        c = center(e)
        if not c:
            continue
        lat, lon = c
        cap = t.get("capacity", "")
        out.append({
            "n": t.get("name") or t.get("name:ko") or "",
            "lat": round(lat, 6), "lon": round(lon, 6),
            "d": round(dist(m["lat"], m["lon"], lat, lon)),
            "k": KIND.get(t.get("parking"), ""),
            "fee": {"yes": "유료", "no": "무료"}.get(t.get("fee"), ""),
            "cap": int(cap) if cap.isdigit() else 0,
        })
    # 이름 있는 곳(공영주차장 등)을 조금 앞세우고 가까운 순
    out.sort(key=lambda p: p["d"] + (0 if p["n"] else 150))
    return out[:LIMIT]


def main():
    markets = json.loads((ROOT / "data" / "markets.json").read_text(encoding="utf-8"))["markets"]
    todo = [m for m in markets if not cache_of(m).exists()]
    done = len(markets) - len(todo)
    print(f"이미 받은 곳 {done}/{len(markets)}, 새로 받을 곳 {len(todo)}", flush=True)
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        if fetch_batch(chunk):
            done += len(chunk)
        else:
            print("   이 묶음은 실패해서 건너뜀:", ", ".join(m["name"] for m in chunk), flush=True)
        print(f"진행 {done * 100 // len(markets)}% ({done}/{len(markets)})", flush=True)
        time.sleep(3)  # 공용 서버라 묶음 사이에 잠깐 쉰다
    result = {f"{m['region']} {m['name']}": lots(m) for m in markets}  # 이름이 같은 시장이 있어 지역을 붙인다
    empty = [k for k, v in result.items() if not v]
    print("주차장 없음:", len(empty), "곳")
    (ROOT / "parking.js").write_text("window.PARKING_DATA = " + json.dumps(result, ensure_ascii=False) + ";\n",
                                     encoding="utf-8")
    print("완료: parking.js")


if __name__ == "__main__":
    main()
