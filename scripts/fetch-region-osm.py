#!/usr/bin/env python3
"""Fetch OSM roads or landscape features for a rectangular pilot region."""

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


def request(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    last_error: Exception | None = None
    for attempt in range(3):
        for endpoint in ENDPOINTS:
            req = urllib.request.Request(
                endpoint,
                data=body,
                headers={"User-Agent": "run-and-local-prototype/1.0 (regional OSM snapshot)"},
            )
            try:
                with urllib.request.urlopen(req, timeout=300) as response:
                    return json.load(response)
            except (urllib.error.URLError, TimeoutError) as error:
                last_error = error
        if attempt < 2:
            time.sleep(20 * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError("unreachable")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--kind", choices=("roads", "features"), default="roads")
    parser.add_argument("--grid", type=int, default=3)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    west, south, east, north = config["bbox"]
    grid = max(1, args.grid)
    lon_breaks = [west + (east - west) * i / grid for i in range(grid + 1)]
    lat_breaks = [south + (north - south) * i / grid for i in range(grid + 1)]
    ways: dict[int, dict] = {}
    timestamp = ""
    checkpoint_dir = args.output.with_suffix(args.output.suffix + ".parts")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    total = grid * grid
    current = 0
    for tile_south, tile_north in zip(lat_breaks, lat_breaks[1:]):
        for tile_west, tile_east in zip(lon_breaks, lon_breaks[1:]):
            current += 1
            checkpoint = checkpoint_dir / f"{args.kind}-{current:02d}.json"
            bounds = (tile_south, tile_west, tile_north, tile_east)
            selector = (
                "way(%s,%s,%s,%s)[highway];"
                if args.kind == "roads"
                else "(way(%s,%s,%s,%s)[natural~\"^(coastline|water|wood)$\"];"
                "way(%s,%s,%s,%s)[waterway~\"^(river|stream|canal)$\"];"
                "way(%s,%s,%s,%s)[leisure~\"^(park|garden|nature_reserve)$\"];"
                "way(%s,%s,%s,%s)[landuse~\"^(forest|recreation_ground|grass|meadow)$\"];);"
            )
            selector = selector % (bounds if args.kind == "roads" else bounds * 4)
            query = f"[out:json][timeout:240][maxsize:268435456];{selector}out body geom;"
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
        "generator": f"scripts/fetch-region-osm.py ({args.kind}) via Overpass API",
        "osm3s": {"timestamp_osm_base": timestamp},
        "elements": list(ways.values()),
        "fetch": {"endpoints": ENDPOINTS, "bbox": config["bbox"], "tiles": total, "kind": args.kind},
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print(f"saved {len(ways)} ways to {args.output}")


if __name__ == "__main__":
    main()
