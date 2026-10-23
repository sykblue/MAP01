"""위키백과(ko)·위키미디어 공용에서 시장 사진과 짧은 설명을 받아 info.js로 저장한다.

사용: python tools/info.py   (data/markets.json이 먼저 있어야 함, 키 불필요)
결과: info.js  (window.MARKET_INFO = {"지역 시장이름": {d, src, url, img, file, credit}})
  - 설명(d): 위키백과 첫 두 문장. 문서가 없으면 비워 두고 화면에서 데이터로 만든 설명을 쓴다.
  - 사진(img): 위키백과 대표 사진, 없으면 시장 반경 안에서 찍힌 공용 사진 중 파일 이름에 시장 이름·"시장"·"market"이 든 것.
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
COMMONS = "https://commons.wikimedia.org/w/api.php"
# 위키미디어 규칙: 연락할 수 있는 주소가 든 User-Agent를 쓰고, 요청은 천천히 하나씩
UA = {"User-Agent": "market-tier-local/1.0 (https://github.com/sykblue/MAP01; study project)"}
PAUSE = 1.0
CACHE = ROOT / "tools" / ".cache" / "info"
CACHE.mkdir(parents=True, exist_ok=True)
WIKI_RADIUS, PHOTO_RADIUS, THUMB = 1500, 400, 480


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
    """'의정부제일시장' → {'의정부제일시장', '의정부제일'}, '전통'·'종합'을 뺀 이름도 함께."""
    keys = {name, name.replace("전통", "").replace("종합", "")}
    keys |= {k[:-2] for k in list(keys) if k.endswith("시장") and len(k) >= 5}
    return {k for k in keys if len(k) >= 2}


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def file_info(title):
    """공용 파일의 썸네일 주소와 저작자·라이선스."""
    d = get(COMMONS, action="query", prop="imageinfo", titles=title, iiprop="url|extmetadata", iiurlwidth=THUMB)
    pages = d.get("query", {}).get("pages") or []
    ii = (pages[0].get("imageinfo") or [None])[0] if pages else None
    if not ii:
        return None
    meta = ii.get("extmetadata", {})
    artist = strip_html(meta.get("Artist", {}).get("value"))[:40]
    lic = strip_html(meta.get("LicenseShortName", {}).get("value"))
    return {"img": ii.get("thumburl") or ii.get("url"), "file": ii.get("descriptionurl"),
            "credit": " · ".join(x for x in (artist, lic) if x)}


def wiki_article(m, keys):
    # 1) 시장 좌표 근처 문서 중 제목에 시장 이름이 든 것  2) 이름 그대로인 문서(좌표가 3km 안이면)
    g = get(WIKI, action="query", list="geosearch", gscoord=f"{m['lat']}|{m['lon']}", gsradius=WIKI_RADIUS, gslimit=50)
    near = [x["title"] for x in g.get("query", {}).get("geosearch", []) if any(k in x["title"] for k in keys)]
    titles = near[:1] or [m["name"]]
    d = get(WIKI, action="query", prop="extracts|pageimages|info|coordinates", titles=titles[0], redirects=1,
            exintro=1, explaintext=1, exsentences=2, piprop="name", inprop="url")
    pages = d.get("query", {}).get("pages") or []
    if not pages or pages[0].get("missing"):
        return None
    pg = pages[0]
    if not near:  # 이름만 같은 다른 곳일 수 있으니 좌표로 확인
        co = (pg.get("coordinates") or [None])[0]
        if not co or dist(m["lat"], m["lon"], co["lat"], co["lon"]) > 3000:
            return None
    text = (pg.get("extract") or "").strip()
    if not text or "동음이의" in text:
        return None
    return {"d": text[:180], "url": pg.get("fullurl"), "pageimage": pg.get("pageimage")}


def commons_photo(m, keys):
    g = get(COMMONS, action="query", list="geosearch", gscoord=f"{m['lat']}|{m['lon']}", gsradius=PHOTO_RADIUS,
            gslimit=50, gsnamespace=6)
    for x in g.get("query", {}).get("geosearch", []):
        t = x["title"]
        if any(k in t for k in keys) or "시장" in t or "market" in t.lower():
            return t
    return None


def info_of(m):
    cache = CACHE / f"{m['region']}_{m['name']}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    keys = keys_for(m["name"])
    out = {}
    art = wiki_article(m, keys)
    if art:
        out.update(d=art["d"], src="위키백과", url=art["url"])
    photo = ("File:" + art["pageimage"]) if art and art.get("pageimage") else commons_photo(m, keys)
    if photo:
        fi = file_info(photo)
        if fi:
            out.update(fi)
    cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def main():
    markets = json.loads((ROOT / "data" / "markets.json").read_text(encoding="utf-8"))["markets"]
    result, failed, step = {}, [], max(1, len(markets) // 20)
    for i, m in enumerate(markets, 1):
        try:
            result[f"{m['region']} {m['name']}"] = info_of(m)  # 이름이 같은 시장이 있어 지역을 붙인다
        except Failed:
            failed.append(m["name"])
            result[f"{m['region']} {m['name']}"] = {}
        if i % step == 0 or i == len(markets):
            print(f"진행 {i * 100 // len(markets)}% ({i}/{len(markets)})", flush=True)
    v = list(result.values())
    print(f"설명 {sum(1 for x in v if x.get('d'))}곳 · 사진 {sum(1 for x in v if x.get('img'))}곳", flush=True)
    if failed:
        print(f"실패 {len(failed)}곳(다시 실행하면 이어서 받음):", ", ".join(failed), flush=True)
    (ROOT / "info.js").write_text("window.MARKET_INFO = " + json.dumps(result, ensure_ascii=False) + ";\n",
                                  encoding="utf-8")
    print("완료: info.js", flush=True)


if __name__ == "__main__":
    main()
