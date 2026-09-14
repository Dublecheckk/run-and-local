#!/usr/bin/env python3
"""Build a compact pedestrian graph for a rectangular pilot region."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

ALLOWED = {"primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service", "pedestrian", "track", "footway", "path", "steps", "cycleway", "road"}
DENIED = {"no", "private", "customers", "delivery", "permit", "agricultural", "forestry"}
PAVED = {"asphalt", "concrete", "concrete:plates", "paving_stones", "sett", "cobblestone", "metal", "wood"}
UNPAVED = {"unpaved", "compacted", "fine_gravel", "gravel", "pebblestone", "ground", "dirt", "earth", "grass", "mud", "sand", "woodchips"}


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(h))


def permitted(tags: dict[str, str]) -> bool:
    highway = tags.get("highway", "")
    if highway not in ALLOWED or tags.get("motorroad") == "yes":
        return False
    if tags.get("construction") or tags.get("proposed") or tags.get("disused") == "yes":
        return False
    if tags.get("access") in DENIED and tags.get("foot") not in {"yes", "designated", "permissive"}:
        return False
    if tags.get("foot") in DENIED:
        return False
    return highway != "cycleway" or tags.get("foot") in {"yes", "designated", "permissive"} or tags.get("sidewalk") not in {None, "no"}


def surface_class(surface: str | None) -> str:
    if surface in PAVED:
        return "paved"
    if surface in UNPAVED:
        return "unpaved"
    return "unknown"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--roads", required=True, type=Path)
    parser.add_argument("--features", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    west, south, east, north = config["bbox"]
    raw_bytes = args.roads.read_bytes()
    raw = json.loads(raw_bytes)
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    excluded = Counter()
    feature_cell_size = 0.002
    feature_cells: dict[str, dict[tuple[int, int], list[tuple[float, float]]]] = defaultdict(lambda: defaultdict(list))

    def add_feature(kind: str, geometry: list[dict]) -> None:
        for point in geometry:
            lon, lat = point["lon"], point["lat"]
            cell = (math.floor(lon / feature_cell_size), math.floor(lat / feature_cell_size))
            feature_cells[kind][cell].append((lon, lat))

    if args.features:
        feature_data = json.loads(args.features.read_bytes())
        for feature in feature_data.get("elements", []):
            geometry = feature.get("geometry", [])
            if len(geometry) < 2:
                continue
            tags = feature.get("tags", {})
            natural, waterway = tags.get("natural"), tags.get("waterway")
            if natural == "coastline": add_feature("coast", geometry)
            if natural == "water": add_feature("lake", geometry)
            if waterway in {"river", "stream", "canal"}: add_feature("river", geometry)
            if natural == "wood" or tags.get("landuse") == "forest": add_feature("forest", geometry)
            if tags.get("leisure") in {"park", "garden", "nature_reserve"} or tags.get("landuse") in {"forest", "recreation_ground", "grass", "meadow"}: add_feature("green", geometry)

    def nearby(kind: str, lon: float, lat: float, degrees: float) -> bool:
        cells = feature_cells.get(kind)
        if not cells:
            return False
        base_x, base_y = math.floor(lon / feature_cell_size), math.floor(lat / feature_cell_size)
        reach = math.ceil(degrees / feature_cell_size)
        limit = degrees * degrees
        for dx in range(-reach, reach + 1):
            for dy in range(-reach, reach + 1):
                for point_lon, point_lat in cells.get((base_x + dx, base_y + dy), []):
                    if (point_lon - lon) ** 2 + (point_lat - lat) ** 2 <= limit:
                        return True
        return False

    for way in raw.get("elements", []):
        if way.get("type") != "way": continue
        tags = way.get("tags", {})
        if not permitted(tags):
            excluded[tags.get("highway", "unknown")] += 1
            continue
        refs, geometry = way.get("nodes", []), way.get("geometry", [])
        if len(refs) != len(geometry): continue
        for ref, point in zip(refs, geometry):
            if west <= point["lon"] <= east and south <= point["lat"] <= north:
                nodes[str(ref)] = {"id": str(ref), "lon": point["lon"], "lat": point["lat"]}
        for index in range(len(refs) - 1):
            start, end = str(refs[index]), str(refs[index + 1])
            if start not in nodes or end not in nodes: continue
            distance = round(metres((nodes[start]["lon"], nodes[start]["lat"]), (nodes[end]["lon"], nodes[end]["lat"])), 3)
            if distance <= 0: continue
            highway = tags.get("highway", "unknown")
            terrain = []
            if highway in {"path", "track", "footway"} and surface_class(tags.get("surface")) != "paved": terrain.append("trail")
            if highway in {"primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service", "road"}: terrain.append("road")
            midpoint_lon = (nodes[start]["lon"] + nodes[end]["lon"]) / 2
            midpoint_lat = (nodes[start]["lat"] + nodes[end]["lat"]) / 2
            for kind, degrees in (("river", 0.0012), ("lake", 0.0012), ("green", 0.0009), ("forest", 0.0004)):
                if nearby(kind, midpoint_lon, midpoint_lat, degrees): terrain.append(kind)
            terrain = list(dict.fromkeys(terrain))
            scenery = "water" if any(kind in terrain for kind in ("river", "lake")) else "green" if any(kind in terrain for kind in ("green", "forest")) else "city" if "road" in terrain else "unknown"
            edge = {"id": f"w{way['id']}:{index}", "from": start, "to": end, "distanceMeters": distance, "bidirectional": tags.get("oneway:foot") not in {"yes", "1", "true"}}
            optional = {"highway": highway, "surface": tags.get("surface"), "access": tags.get("access"), "foot": tags.get("foot"), "lit": tags.get("lit"), "sidewalk": tags.get("sidewalk"), "scenery": scenery, "terrainTags": terrain, "surfaceClass": surface_class(tags.get("surface")), "bridge": tags.get("bridge") not in {None, "no"}, "tunnel": tags.get("tunnel") not in {None, "no"}, "steps": highway == "steps", "gradeQuality": "structure-unknown" if highway == "steps" or tags.get("bridge") not in {None, "no"} or tags.get("tunnel") not in {None, "no"} else "missing"}
            edge.update({key: value for key, value in optional.items() if value not in (None, False, "", "unknown", [], "missing")})
            edges.append(edge)

    used_nodes = {edge["from"] for edge in edges} | {edge["to"] for edge in edges}
    nodes = {node_id: node for node_id, node in nodes.items() if node_id in used_nodes}
    adjacency: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        adjacency[edge["from"]].add(edge["to"])
        adjacency[edge["to"]].add(edge["from"])
    components: list[list[str]] = []
    unseen = set(nodes)
    while unseen:
        seed = unseen.pop()
        queue, members = deque([seed]), [seed]
        while queue:
            current = queue.popleft()
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    members.append(neighbor)
                    queue.append(neighbor)
        components.append(members)
    largest = max(components, key=len)
    largest_nodes = [nodes[node_id] for node_id in largest]
    origins = []
    for origin in config["origins"]:
        node = min(largest_nodes, key=lambda item: metres((origin["lon"], origin["lat"]), (item["lon"], item["lat"])))
        origins.append({"name": origin["name"], "nodeId": node["id"], "lon": node["lon"], "lat": node["lat"]})
    output = {
        "version": f"2.0.0-{config['id']}-pilot",
        "bbox": config["bbox"],
        "nodes": list(nodes.values()),
        "edges": edges,
        "pois": [],
        "origins": origins,
        "metadata": {"region": config["name"], "fetchedAt": datetime.now(timezone.utc).isoformat(), "osmTimestamp": raw.get("osm3s", {}).get("timestamp_osm_base", "unknown"), "rawSha256": hashlib.sha256(raw_bytes).hexdigest(), "componentSizes": sorted((len(component) for component in components), reverse=True), "excludedWays": dict(excluded), "newRoadElevation": "unknown", "newRoadTheme": "OSM road/trail tags plus approximate water/green proximity", "attribution": "© OpenStreetMap contributors, ODbL 1.0"},
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({"nodes": len(nodes), "edges": len(edges), "origins": len(origins), "components": len(components), "largest": len(largest), "bytes": args.output.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
