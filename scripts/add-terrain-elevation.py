#!/usr/bin/env python3
"""Enrich a routing graph with open Terrarium DEM elevation and grades."""

from __future__ import annotations

import argparse
import json
import math
import struct
import urllib.request
import zlib
from collections import defaultdict
from pathlib import Path

TILE_SIZE = 256
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def decode_png(data: bytes) -> tuple[int, int, int, bytes]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Terrain tile is not a PNG")
    offset, width, height, channels = 8, 0, 0, 0
    compressed = bytearray()
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        offset += length + 12
        if kind == b"IHDR":
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
            if bit_depth != 8 or color_type not in (2, 6) or compression or filtering or interlace:
                raise ValueError("Unsupported Terrain PNG format")
            channels = 3 if color_type == 2 else 4
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(bytes(compressed))
    stride = width * channels
    rows, previous, cursor = bytearray(), bytearray(stride), 0
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        row = bytearray(raw[cursor : cursor + stride])
        cursor += stride
        for index in range(stride):
            left = row[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 1:
                row[index] = (row[index] + left) & 255
            elif filter_type == 2:
                row[index] = (row[index] + above) & 255
            elif filter_type == 3:
                row[index] = (row[index] + ((left + above) >> 1)) & 255
            elif filter_type == 4:
                estimate = left + above - upper_left
                pa, pb, pc = abs(estimate - left), abs(estimate - above), abs(estimate - upper_left)
                predictor = left if pa <= pb and pa <= pc else above if pb <= pc else upper_left
                row[index] = (row[index] + predictor) & 255
            elif filter_type != 0:
                raise ValueError(f"Unsupported PNG filter {filter_type}")
        rows.extend(row)
        previous = row
    return width, height, channels, bytes(rows)


def tile_position(lon: float, lat: float, zoom: int) -> tuple[int, int, int, int]:
    scale = 2**zoom
    x = (lon + 180) / 360 * scale
    lat_rad = math.radians(max(-85.05112878, min(85.05112878, lat)))
    y = (1 - math.asinh(math.tan(lat_rad)) / math.pi) / 2 * scale
    return math.floor(x), math.floor(y), min(255, int((x % 1) * TILE_SIZE)), min(255, int((y % 1) * TILE_SIZE))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/run-and-local-terrain"))
    parser.add_argument("--zoom", type=int, default=13)
    args = parser.parse_args()
    graph = json.loads(args.input.read_text())
    args.cache.mkdir(parents=True, exist_ok=True)
    tiles: dict[tuple[int, int], tuple[int, int, int, bytes]] = {}

    def elevation(lon: float, lat: float) -> float:
        tile_x, tile_y, pixel_x, pixel_y = tile_position(lon, lat, args.zoom)
        key = (tile_x, tile_y)
        if key not in tiles:
            tile_path = args.cache / f"{args.zoom}-{tile_x}-{tile_y}.png"
            if not tile_path.exists():
                urllib.request.urlretrieve(
                    TILE_URL.format(z=args.zoom, x=tile_x, y=tile_y), tile_path
                )
            tiles[key] = decode_png(tile_path.read_bytes())
        width, _, channels, pixels = tiles[key]
        offset = (pixel_y * width + pixel_x) * channels
        red, green, blue = pixels[offset : offset + 3]
        return red * 256 + green + blue / 256 - 32768

    nodes = {node["id"]: node for node in graph["nodes"]}
    raw_elevation = {
        node_id: elevation(node["lon"], node["lat"]) for node_id, node in nodes.items()
    }
    neighbors: dict[str, list[str]] = defaultdict(list)
    for edge in graph["edges"]:
        neighbors[edge["from"]].append(edge["to"])
        neighbors[edge["to"]].append(edge["from"])
    smoothed = raw_elevation
    for _ in range(2):
        smoothed = {
            node_id: (2 * smoothed[node_id] + sum(smoothed[n] for n in adjacent))
            / (2 + len(adjacent))
            if adjacent
            else smoothed[node_id]
            for node_id, adjacent in neighbors.items()
        }
    for node_id, node in nodes.items():
        node["elevationMeters"] = round(smoothed[node_id], 2)
    known_edges = 0
    for edge in graph["edges"]:
        if edge.get("bridge") or edge.get("tunnel") or edge.get("steps"):
            edge.pop("gradePercent", None)
            edge["gradeQuality"] = "structure-unknown"
            continue
        # OSM frequently splits a road into very short segments. Calculating a
        # raster DEM slope over those few metres exaggerates pixel noise, so use
        # a transparent 60 m minimum baseline appropriate for this pilot DEM.
        effective_distance = max(60, edge["distanceMeters"])
        grade = (
            (smoothed[edge["to"]] - smoothed[edge["from"]])
            / effective_distance
            * 100
        )
        edge["gradePercent"] = round(max(-25, min(25, grade)), 2)
        edge["gradeQuality"] = "dem-estimate"
        known_edges += 1
    graph.setdefault("metadata", {})["terrain"] = {
        "dem": {
            "name": "Mapzen Terrain Tiles (Terrarium)",
            "source": "AWS Open Data Registry",
            "url": "https://registry.opendata.aws/terrain-tiles/",
            "licenseUrl": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
            "zoom": args.zoom,
            "method": "nearest-pixel sample, two-pass graph smoothing, 60 m minimum grade baseline",
            "attribution": "Mapzen terrain data sources and contributors",
        },
        "gradeCoverageEdges": known_edges / len(graph["edges"]),
        "structureUnknownEdges": len(graph["edges"]) - known_edges,
    }
    args.output.write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({"nodes": len(nodes), "tiles": len(tiles), "gradeEdges": known_edges, "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
