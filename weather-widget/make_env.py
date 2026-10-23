"""날씨 위젯이 쓰는 값만 골라 브라우저가 읽을 수 있는 env.js로 옮긴다.

사용: python weather-widget/make_env.py
결과: weather-widget/env.js  (window.WEATHER_ENV = {...})
값 출처: 로컬은 루트 .env, Vercel 빌드는 프로젝트 환경변수(.env가 git에 없으므로).
루트 .env에는 SDSC_KEY 같은 비밀 값도 있으므로 PUBLIC_KEYS에 적은 것만 옮긴다.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV = HERE.parent / ".env"
PUBLIC_KEYS = ["OPEN_METEO_URL"]  # env.js는 브라우저에 그대로 보인다. 비밀 값은 절대 추가하지 않는다.

values = {}
if ENV.exists():
    for line in ENV.read_text(encoding="utf-8-sig").splitlines():  # -sig: 메모장이 붙이는 BOM 제거
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() in PUBLIC_KEYS:
            values[k.strip()] = v.strip()
for k in PUBLIC_KEYS:  # .env에 없는 값은 환경변수에서
    if not values.get(k) and os.environ.get(k):
        values[k] = os.environ[k].strip()

missing = [k for k in PUBLIC_KEYS if not values.get(k)]
if missing:
    sys.exit("값이 없습니다: " + ", ".join(missing) +
             " (로컬: 루트 .env에 추가, Vercel: 프로젝트 환경변수에 등록)")

(HERE / "env.js").write_text("window.WEATHER_ENV = " + json.dumps(values, ensure_ascii=False) + ";\n",
                             encoding="utf-8")
print("env.js 생성:", ", ".join(values))
