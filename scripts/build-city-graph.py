#!/usr/bin/env python3
"""Build a reproducible Gangneung-wide pedestrian graph from Overpass JSON.

The script deliberately keeps OSM way/node topology intact. Existing enriched
terrain records are reused where edge IDs match; newly covered roads retain
explicit OSM surface/lighting/access evidence and leave elevation unknown.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import LineString, Point
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ALLOWED = {
    "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "service", "pedestrian", "track", "footway", "path",
    "steps", "cycleway", "road",
}
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
    parser.add_argument("--roads", required=True, type=Path)
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--features", type=Path)
    parser.add_argument("--boundary", required=True, type=Path)
    args = parser.parse_args()

    raw_bytes = args.roads.read_bytes()
    raw = json.loads(raw_bytes)
    base = json.loads(args.base.read_text())
    boundary_data = json.loads(args.boundary.read_bytes())
    relation = boundary_data["elements"][0]
    boundary_lines = [
        LineString([(point["lon"], point["lat"]) for point in member.get("geometry", [])])
        for member in relation.get("members", [])
        if member.get("role") == "outer" and len(member.get("geometry", [])) > 1
    ]
    boundary_polygons = list(polygonize(unary_union(boundary_lines)))
    if not boundary_polygons:
        raise ValueError("Gangneung boundary could not be polygonized")
    boundary = max(boundary_polygons, key=lambda polygon: polygon.area)
    old_nodes = {node["id"]: node for node in base["nodes"]}
    old_edges = {edge["id"]: edge for edge in base["edges"]}
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    excluded = Counter()
    feature_groups: dict[str, list[LineString]] = defaultdict(list)
    if args.features:
        feature_data = json.loads(args.features.read_bytes())
        for feature in feature_data.get("elements", []):
            geometry = feature.get("geometry", [])
            if len(geometry) < 2:
                continue
            line = LineString([(point["lon"], point["lat"]) for point in geometry])
            tags = feature.get("tags", {})
            natural, waterway = tags.get("natural"), tags.get("waterway")
            if natural == "coastline":
                feature_groups["coast"].append(line)
            if natural == "water":
                feature_groups["lake"].append(line)
            if waterway in {"river", "stream", "canal"}:
                feature_groups["river"].append(line)
            if natural == "wood" or tags.get("landuse") == "forest":
                feature_groups["forest"].append(line)
            if tags.get("leisure") in {"park", "garden", "nature_reserve"} or tags.get("landuse") in {"forest", "recreation_ground", "grass", "meadow"}:
                feature_groups["green"].append(line)
    feature_trees = {kind: STRtree(lines) for kind, lines in feature_groups.items() if lines}

    def nearby(kind: str, point: Point, degrees: float) -> bool:
        tree = feature_trees.get(kind)
        return bool(tree is not None and len(tree.query(point, predicate="dwithin", distance=degrees)))

    for way in raw.get("elements", []):
        if way.get("type") != "way":
            continue
        tags = way.get("tags", {})
        if not permitted(tags):
            excluded[tags.get("highway", "unknown")] += 1
            continue
        refs, geometry = way.get("nodes", []), way.get("geometry", [])
        if len(refs) != len(geometry):
            continue
        for ref, point in zip(refs, geometry):
            node_id = str(ref)
            old = old_nodes.get(node_id, {})
            nodes[node_id] = {
                "id": node_id,
                "lon": point["lon"],
                "lat": point["lat"],
                "crossing": old.get("crossing", False),
                "elevationMeters": old.get("elevationMeters"),
            }
        for index in range(len(refs) - 1):
            edge_id = f"w{way['id']}:{index}"
            start, end = str(refs[index]), str(refs[index + 1])
            if not (
                boundary.covers(Point(nodes[start]["lon"], nodes[start]["lat"]))
                and boundary.covers(Point(nodes[end]["lon"], nodes[end]["lat"]))
            ):
                continue
            distance = round(metres((nodes[start]["lon"], nodes[start]["lat"]), (nodes[end]["lon"], nodes[end]["lat"])), 3)
            if distance <= 0:
                continue
            if edge_id in old_edges and old_edges[edge_id]["from"] == start and old_edges[edge_id]["to"] == end:
                edge = old_edges[edge_id]
            else:
                highway = tags.get("highway", "unknown")
                terrain = []
                if highway in {"path", "track", "footway"} and surface_class(tags.get("surface")) != "paved":
                    terrain.append("trail")
                if highway in {"primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service", "road"}:
                    terrain.append("road")
                midpoint = Point(
                    (nodes[start]["lon"] + nodes[end]["lon"]) / 2,
                    (nodes[start]["lat"] + nodes[end]["lat"]) / 2,
                )
                for kind, degrees in (("coast", 0.0017), ("river", 0.0012), ("lake", 0.0012), ("green", 0.0009), ("forest", 0.0004)):
                    if nearby(kind, midpoint, degrees):
                        terrain.append(kind)
                terrain = list(dict.fromkeys(terrain))
                scenery = "water" if any(kind in terrain for kind in ("coast", "river", "lake")) else "green" if any(kind in terrain for kind in ("green", "forest")) else "city" if "road" in terrain else "unknown"
                edge = {
                    "id": edge_id,
                    "from": start,
                    "to": end,
                    "distanceMeters": distance,
                    "bidirectional": tags.get("oneway:foot") not in {"yes", "1", "true"},
                    "wayId": str(way["id"]),
                    "highway": highway,
                    "surface": tags.get("surface", "unknown"),
                    "access": tags.get("access", "unknown"),
                    "foot": tags.get("foot", "unknown"),
                    "lit": tags.get("lit", "unknown"),
                    "sidewalk": tags.get("sidewalk", "unknown"),
                    "name": tags.get("name", ""),
                    "scenery": scenery,
                    "terrainTags": terrain,
                    "surfaceClass": surface_class(tags.get("surface")),
                    "bridge": tags.get("bridge") not in {None, "no"},
                    "tunnel": tags.get("tunnel") not in {None, "no"},
                    "steps": highway == "steps",
                    "gradePercent": None,
                    "gradeQuality": "structure-unknown" if highway == "steps" or tags.get("bridge") not in {None, "no"} or tags.get("tunnel") not in {None, "no"} else "missing",
                }
            edges.append(edge)

    used_nodes = {edge["from"] for edge in edges} | {edge["to"] for edge in edges}
    nodes = {node_id: node for node_id, node in nodes.items() if node_id in used_nodes}
    adjacency: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        adjacency[edge["from"]].add(edge["to"])
        adjacency[edge["to"]].add(edge["from"])
    component = 0
    sizes = []
    component_by_node: dict[str, int] = {}
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
        for node_id in members:
            component_by_node[node_id] = component
        sizes.append(len(members))
        component += 1

    # Existing curated POIs remain as an offline fallback and are re-snapped by
    # node ID where possible. Live destination discovery comes from Kakao.
    pois = [poi for poi in base["pois"] if poi.get("nodeId") in nodes]
    origins = [origin for origin in base.get("origins", []) if origin.get("nodeId") in nodes]
    xs = [node["lon"] for node in nodes.values()]
    ys = [node["lat"] for node in nodes.values()]
    compact_nodes = []
    for node in nodes.values():
        compact = {key: node[key] for key in ("id", "lon", "lat")}
        if node.get("crossing"):
            compact["crossing"] = True
        if node.get("elevationMeters") is not None:
            compact["elevationMeters"] = node["elevationMeters"]
        compact_nodes.append(compact)
    optional_edge_fields = (
        "highway", "surface", "access", "foot", "lit", "sidewalk", "name",
        "scenery", "terrainTags", "surfaceClass", "bridge", "tunnel", "steps",
        "gradePercent", "gradeQuality",
    )
    compact_edges = []
    for edge in edges:
        compact = {key: edge[key] for key in ("id", "from", "to", "distanceMeters", "bidirectional")}
        for key in optional_edge_fields:
            value = edge.get(key)
            if value not in (None, False, "", "unknown", [], "missing"):
                compact[key] = value
        compact_edges.append(compact)
    output = {
        "version": "2.0.0-gangneung-city",
        "bbox": [min(xs), min(ys), max(xs), max(ys)],
        "nodes": compact_nodes,
        "edges": compact_edges,
        "pois": pois,
        "origins": origins,
        "metadata": {
            **base.get("metadata", {}),
            "region": "강릉시 행정구역 전역 보행 도로망",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "osmTimestamp": raw.get("osm3s", {}).get("timestamp_osm_base", "unknown"),
            "rawSha256": hashlib.sha256(raw_bytes).hexdigest(),
            "endpoint": "https://overpass.kumi.systems/api/interpreter",
            "boundaryRelation": 2537817,
            "componentSizes": sorted(sizes, reverse=True),
            "excludedWays": dict(excluded),
            "expansion": {
                "method": "OSM highway ways intersecting Gangneung administrative area 3602537817",
                "existingTerrainReused": True,
                "newRoadElevation": "unknown",
                "newRoadTheme": "OSM road/trail tags plus approximate coast/water/green proximity",
            },
        },
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({"nodes": len(nodes), "edges": len(edges), "pois": len(pois), "origins": len(origins), "components": len(sizes), "largest": max(sizes), "bytes": args.output.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
