"""시장 카드에 쓸 사진을 모은다.

사용: python tools/images.py
순서: 한국관광공사 TourAPI(키가 등록돼 있을 때) → 한국어 위키백과 대표 이미지 → 위키미디어 공용 파일 검색
결과: data/images.json, images.js (window.MARKET_IMAGES = {"시장이름|시군구": {...}})
(같은 이름의 시장이 여러 곳이라 시·군·구까지 붙인 키를 쓴다. 예: 못골시장|수원시 팔달구, 못골시장|남구)
키: .env의 TOUR_KEY, 없으면 SDSC_KEY (공공데이터포털에서 'TourAPI 국문 관광정보 서비스' 활용신청이 돼 있어야 함)
"""
import hashlib
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache" / "img"
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "kkul-market-tier/1.0 (educational project; python-urllib)"}
WIKI_GAP = 1.5  # 위키미디어 요청 간격(초)
TOUR_API = "https://apis.data.go.kr/B551011/KorService2/searchKeyword2"
# 위키에서 이름만 같고 다른 대상의 사진이 잡히는 시장 (직접 확인 후 제외)
SKIP = {
    "자유시장": "위키백과 '자유시장' 문서는 경제 용어라 무관한 그림이 나옴",
    "역전시장": "대전 동구 역전시장인데 순천 역전시장 사진이 잡힘",
}


def load_key():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env.get("TOUR_KEY") or env.get("SDSC_KEY")


def cached_get(url, params, gap):
    """캐시를 먼저 보고, 없으면 받아서 저장한다. 429/5xx는 기다렸다 다시 시도."""
    full = url + "?" + urllib.parse.urlencode(params)
    path = CACHE / (hashlib.sha1(re.sub(r"serviceKey=[^&]+", "", full).encode()).hexdigest() + ".json")
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    for attempt in range(6):
        time.sleep(gap)
        try:
            with urllib.request.urlopen(urllib.request.Request(full, headers=UA), timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                wait = int(e.headers.get("Retry-After") or 0) or 30 * (attempt + 1)
                print(f"  {e.code} → {wait}초 대기", flush=True)
                time.sleep(wait)
                continue
            raise
    raise SystemExit("요청이 계속 막힙니다. 잠시 뒤 다시 실행하세요 (받은 결과는 캐시에 남아 있어요).")


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


# 1) 관광공사 TourAPI: 시장은 쇼핑(38) 유형으로 등록돼 있고 대표 사진(firstimage)이 있다
class Tour:
    def __init__(self, key):
        self.key = key
        self.ok = bool(key)

    def find(self, m):
        if not self.ok:
            return None
        params = {"serviceKey": self.key, "MobileOS": "ETC", "MobileApp": "kkul", "_type": "json",
                  "keyword": m["name"], "contentTypeId": 38, "numOfRows": 10}
        try:
            data = cached_get(TOUR_API, params, 0.2)
        except urllib.error.HTTPError as e:
            print("TourAPI 사용 불가 (활용신청 안 된 키) → 위키미디어만 씁니다:", e.code)
            self.ok = False
            return None
        items = (((data.get("response") or {}).get("body") or {}).get("items") or {})
        items = items.get("item") if isinstance(items, dict) else []
        if isinstance(items, dict):  # 결과가 1건이면 목록이 아니라 객체로 온다
            items = [items]
        # 같은 이름의 시장이 여러 도시에 있어 주소의 시·군·구(없으면 시·도 앞 두 글자)까지 맞아야 쓴다
        sgg = (m.get("sgg") or "").split(" ")[0]
        place = sgg or (m.get("sido") or m["region"])[:2]
        # "다이소 ○○시장점"처럼 시장 이름이 붙은 가게(…점)는 빼고, 제목이 시장 이름과 같은 결과를 먼저 고른다
        same = lambda t: re.sub(r"\s|\(.*?\)", "", t) == m["name"]
        cands = [it for it in items or []
                 if m["name"] in it.get("title", "") and not it["title"].rstrip().endswith("점")
                 and place in (it.get("addr1") or "") and it.get("firstimage")]
        for it in sorted(cands, key=lambda it: not same(it["title"])):
            return {"src": it["firstimage"], "from": "한국관광공사 TourAPI", "credit": "한국관광공사",
                        "link": "https://korean.visitkorea.or.kr/"}
        return None


# 2) 한국어 위키백과 문서의 대표 이미지
def from_wikipedia(m):
    data = cached_get("https://ko.wikipedia.org/w/api.php", {
        "action": "query", "titles": m["name"], "prop": "pageimages", "piprop": "thumbnail|name",
        "pithumbsize": 640, "redirects": 1, "format": "json"}, WIKI_GAP)
    for page in data.get("query", {}).get("pages", {}).values():
        if page.get("thumbnail") and page.get("pageimage"):
            info = commons_info("File:" + page["pageimage"])
            if info:
                return info
    return None


# 3) 위키미디어 공용 파일 검색: 파일 이름에 시장 이름이 들어간 사진만 쓴다
def from_commons(m):
    data = cached_get("https://commons.wikimedia.org/w/api.php", {
        "action": "query", "list": "search", "srsearch": f'"{m["name"]}" filetype:bitmap',
        "srnamespace": 6, "srlimit": 10, "format": "json"}, WIKI_GAP)
    for hit in data.get("query", {}).get("search", []):
        if m["name"] in hit["title"]:
            info = commons_info(hit["title"])
            if info:
                return info
    return None


def commons_info(title):
    data = cached_get("https://commons.wikimedia.org/w/api.php", {
        "action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|extmetadata",
        "iiurlwidth": 640, "format": "json"}, WIKI_GAP)
    for page in data.get("query", {}).get("pages", {}).values():
        ii = (page.get("imageinfo") or [None])[0]
        if not ii or not ii.get("thumburl"):
            continue
        meta = ii.get("extmetadata", {})
        artist = strip_tags(meta.get("Artist", {}).get("value"))[:60]
        lic = strip_tags(meta.get("LicenseShortName", {}).get("value"))
        return {"src": ii["thumburl"], "from": "Wikimedia Commons",
                "credit": " · ".join(x for x in (artist, lic) if x), "link": ii.get("descriptionurl", "")}
    return None


def main():
    markets = json.loads((ROOT / "data" / "markets.json").read_text(encoding="utf-8"))["markets"]
    tour = Tour(load_key())
    out = {}
    for i, m in enumerate(markets, 1):
        # 관광공사 결과는 주소로 확인하므로 SKIP은 위키 사진에만 적용한다
        img = tour.find(m) or (None if m["name"] in SKIP else from_wikipedia(m) or from_commons(m))
        if img:
            out[f'{m["name"]}|{m.get("sgg") or ""}'] = img
        print(f"[{i:3}/{len(markets)}] {m['name']:<12} {img['from'] if img else '-'}", flush=True)

    (ROOT / "data" / "images.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "images.js").write_text("window.MARKET_IMAGES = " + json.dumps(out, ensure_ascii=False) + ";\n",
                                    encoding="utf-8")
    print(f"완료: {len(out)}/{len(markets)} 곳 사진 찾음")


if __name__ == "__main__":
    main()
