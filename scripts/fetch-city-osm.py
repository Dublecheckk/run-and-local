#!/usr/bin/env python3
"""Fetch Gangneung-wide OSM roads in small, sequential Overpass requests."""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
AREA_ID = 3_602_537_817
# Administrative bounds split into modest requests. The area predicate keeps
# neighboring municipalities and the large offshore bounding area out.
LAT_BREAKS = [37.50, 37.64, 37.78, 37.92, 38.07]
LON_BREAKS = [128.57, 128.75, 128.93, 129.11]


def request(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    last_error: Exception | None = None
    for attempt in range(3):
        for endpoint in ENDPOINTS:
            req = urllib.request.Request(
                endpoint,
                data=body,
                headers={"User-Agent": "run-and-local-prototype/1.0 (one-off OSM snapshot)"},
            )
            try:
                with urllib.request.urlopen(req, timeout=300) as response:
                    return json.load(response)
            except (urllib.error.URLError, TimeoutError) as error:
                last_error = error
        if attempt < 2:
            time.sleep(30 * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError("unreachable")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--kind", choices=("roads", "features"), default="roads")
    args = parser.parse_args()
    ways: dict[int, dict] = {}
    timestamp = ""
    checkpoint_dir = args.output.with_suffix(args.output.suffix + ".parts")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    total = (len(LAT_BREAKS) - 1) * (len(LON_BREAKS) - 1)
    current = 0
    for south, north in zip(LAT_BREAKS, LAT_BREAKS[1:]):
        for west, east in zip(LON_BREAKS, LON_BREAKS[1:]):
            current += 1
            checkpoint = checkpoint_dir / f"{args.kind}-{current:02d}.json"
            selector = (
                "way(area.a)(%s,%s,%s,%s)[highway];"
                if args.kind == "roads"
                else "(way(area.a)(%s,%s,%s,%s)[natural~\"^(coastline|water|wood)$\"];"
                "way(area.a)(%s,%s,%s,%s)[waterway~\"^(river|stream|canal)$\"];"
                "way(area.a)(%s,%s,%s,%s)[leisure~\"^(park|garden|nature_reserve)$\"];"
                "way(area.a)(%s,%s,%s,%s)[landuse~\"^(forest|recreation_ground|grass|meadow)$\"];);"
            )
            bounds = (south, west, north, east)
            selector = selector % (bounds if args.kind == "roads" else bounds * 4)
            query = (
                "[out:json][timeout:240][maxsize:268435456];"
                f"area({AREA_ID})->.a;{selector}out body geom;"
            )
            if checkpoint.exists():
                data = json.loads(checkpoint.read_bytes())
            else:
                data = request(query)
                checkpoint.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
            timestamp = data.get("osm3s", {}).get("timestamp_osm_base", timestamp)
            for element in data.get("elements", []):
                if element.get("type") == "way":
                    ways[element["id"]] = element
            print(f"tile {current}/{total}: {len(data.get('elements', []))} ways; {len(ways)} unique")
            if current < total:
                time.sleep(2)
    output = {
        "version": 0.6,
        "generator": f"scripts/fetch-city-osm.py ({args.kind}) via Overpass API",
        "osm3s": {"timestamp_osm_base": timestamp},
        "elements": list(ways.values()),
        "fetch": {
            "endpoints": ENDPOINTS,
            "areaId": AREA_ID,
            "tiles": total,
            "sequential": True,
            "kind": args.kind,
        },
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print(f"saved {len(ways)} ways to {args.output}")


if __name__ == "__main__":
    main()
