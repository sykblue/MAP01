"""위키백과(ko)에서 시장 설명을 받아 info.js로 저장한다.

사용: python tools/info.py   (data/markets.json이 먼저 있어야 함, 키 불필요)
결과: info.js  (window.MARKET_INFO = {"지역 시장이름": {d, src, url}})
  - 설명(d): 위키백과 첫 두 문장. 문서가 없으면 비워 두고 화면에서 데이터로 만든 설명을 쓴다.
"""
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = "https://ko.wikipedia.org/w/api.php"
# 위키미디어 규칙: 연락할 수 있는 주소가 든 User-Agent를 쓰고, 요청은 천천히 하나씩
UA = {"User-Agent": "market-tier-local/1.0 (https://github.com/sykblue/MAP01; study project)"}
PAUSE = 1.0
CACHE = ROOT / "tools" / ".cache" / "info"
CACHE.mkdir(parents=True, exist_ok=True)
WIKI_RADIUS = 1500
KEEP = ("d", "src", "url")  # info.js에 남기는 항목


def dist(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class Failed(Exception):
    pass


def get(base, **params):
    params.update(format="json", formatversion=2)
    url = base + "?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            time.sleep(PAUSE)
            return data
        except urllib.error.HTTPError as e:  # 429면 서버가 알려 준 만큼(없으면 점점 길게) 쉰다
            wait = int(e.headers.get("Retry-After") or 0) or 20 * (attempt + 1)
            print(f"   재시도 {attempt + 1}: HTTP {e.code}, {wait}초 대기", flush=True)
            time.sleep(wait)
        except Exception as e:
            print(f"   재시도 {attempt + 1}: {e}", flush=True)
            time.sleep(5 + attempt * 5)
    raise Failed(url)  # 실패한 시장은 캐시에 남기지 않아 다음 실행 때 다시 받는다


def keys_for(name):
    """시장 이름과 '전통'·'종합'을 뺀 이름. '시장'까지는 떼지 않는다(떼면 '강릉중앙고등학교'처럼 엉뚱한 곳이 걸린다)."""
    return {name, name.replace("전통", ""), name.replace("종합", ""), name.replace("전통", "").replace("종합", "")}


def norm(title):
    """'광장 시장 (서울)' → '광장시장' 처럼 띄어쓰기·밑줄·괄호 설명을 지운다."""
    return re.sub(r"[\s_]|\(.*?\)", "", title)


def wiki_article(m, keys):
    # 1) 시장 좌표 근처 문서 중 제목이 시장 이름과 같은 것  2) 이름 그대로인 문서(좌표가 3km 안이면)
    g = get(WIKI, action="query", list="geosearch", gscoord=f"{m['lat']}|{m['lon']}", gsradius=WIKI_RADIUS, gslimit=50)
    near = [x["title"] for x in g.get("query", {}).get("geosearch", []) if norm(x["title"]) in keys]
    title = near[0] if near else m["name"]
    d = get(WIKI, action="query", prop="extracts|info|coordinates", titles=title, redirects=1,
            exintro=1, explaintext=1, exsentences=2, inprop="url")
    pages = d.get("query", {}).get("pages") or []
    if not pages or pages[0].get("missing"):
        return None
    pg = pages[0]
    if norm(pg.get("title", "")) not in keys:  # 넘겨주기로 역·학교 문서로 간 경우
        return None
    if not near:  # 이름만 같은 다른 곳일 수 있으니 좌표로 확인
        co = (pg.get("coordinates") or [None])[0]
        if not co or dist(m["lat"], m["lon"], co["lat"], co["lon"]) > 3000:
            return None
    text = (pg.get("extract") or "").strip()
    if not text or "동음이의" in text or "시장" not in text.split(".")[0]:
        return None
    return {"d": text[:180], "src": "위키백과", "url": pg.get("fullurl")}


def info_of(m):
    cache = CACHE / f"{m['region']}_{m['name']}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    out = wiki_article(m, keys_for(m["name"])) or {}
    cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def main():
    markets = json.loads((ROOT / "data" / "markets.json").read_text(encoding="utf-8"))["markets"]
    result, failed, step = {}, [], max(1, len(markets) // 20)
    for i, m in enumerate(markets, 1):
        key = f"{m['region']} {m['name']}"  # 이름이 같은 시장이 있어 지역을 붙인다
        try:
            result[key] = {k: v for k, v in info_of(m).items() if k in KEEP}
        except Failed:
            failed.append(m["name"])
            result[key] = {}
        if i % step == 0 or i == len(markets):
            print(f"진행 {i * 100 // len(markets)}% ({i}/{len(markets)})", flush=True)
    print(f"위키백과 설명 {sum(1 for x in result.values() if x.get('d'))}곳 (나머지는 데이터로 만든 설명)", flush=True)
    if failed:
        print(f"실패 {len(failed)}곳(다시 실행하면 이어서 받음):", ", ".join(failed), flush=True)
    (ROOT / "info.js").write_text("window.MARKET_INFO = " + json.dumps(result, ensure_ascii=False) + ";\n",
                                  encoding="utf-8")
    print("완료: info.js", flush=True)


if __name__ == "__main__":
    main()
