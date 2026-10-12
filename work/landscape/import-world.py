"""Offline scenery conversion. Requires original NASA SRTMGL1 v003 ZIPs.

No authentication handling. Download the three ZIPs through Earthdata Search,
then pass their directory with --srtm-dir. OSM is a separate ODbL database;
its route is used only for estimated geographic registration, never driving.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request
import urllib.error
import zipfile

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".impeccable/review/landscape/source-cache"
OUTPUT = ROOT / "outputs/data/landscape"
DATASETS = {
    "monza": (284565, "N45E009", ["monza-osm"]),
    "monaco": (148194, "N43E007", ["monaco-osm"]),
    "le-mans": (2126739, "N47E000", ["le-mans-osm-north", "le-mans-osm-south"]),
}
MAP_BOUNDS = {"monza-osm": "9.26,45.604,9.302,45.637", "monaco-osm": "7.416,43.730,7.435,43.745",
              "le-mans-osm-north": "0.192,47.929,0.249,47.958", "le-mans-osm-south": "0.192,47.898,0.249,47.929"}
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=C2763266360-LPCLOUD"
DOI = "https://doi.org/10.5067/MEaSUREs/SRTM/SRTMGL1.003"
COVERAGE = {"monza": 1000, "monaco": 1000, "le-mans": 2000}


def landscape_maps(id, registration, road, boundaries, fallback):
    if id != "le-mans":
        return fallback
    extent = np.vstack([road, *[np.array(ring, dtype=float) for ring in boundaries]])
    lo, hi = extent.min(axis=0) - COVERAGE[id] - 150, extent.max(axis=0) + COVERAGE[id] + 150
    corners = np.array([[x, y] for x in [lo[0], hi[0]] for y in [lo[1], hi[1]]])
    local = corners @ np.array(registration["matrix"]).T + registration["translation"]
    geo = local / registration["metresPerDegree"] + registration["referenceLonLat"]
    west, south = np.floor(geo.min(axis=0) * 1000) / 1000
    east, north = np.ceil(geo.max(axis=0) * 1000) / 1000
    xs = np.linspace(west, east, math.ceil((east-west) / .03) + 1)
    ys = np.linspace(south, north, math.ceil((north-south) / .03) + 1)
    names = []
    for iy in range(len(ys)-1):
        for ix in range(len(xs)-1):
            bbox = ",".join(f"{v:.6f}" for v in [xs[ix], ys[iy], xs[ix+1], ys[iy+1]])
            name = "le-mans-2km-" + digest(bbox.encode())[:12]
            MAP_BOUNDS[name] = bbox
            names.append(name)
    return names


def digest(data):
    return hashlib.sha256(data).hexdigest()


def download(url, file):
    if not file.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Male-CNS-Circuit-Lab/offline-scenery"})
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                data = response.read()
        except urllib.error.HTTPError as error:
            print('Source download rejected:', url, error.code, error.read(400).decode('utf-8', 'replace'), flush=True)
            raise
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
    return json.loads(file.read_bytes())


def route(data, relation_id):
    elements = data["elements"]
    nodes = {e["id"]: e for e in elements if e["type"] == "node"}
    ways = {e["id"]: e for e in elements if e["type"] == "way"}
    relation = next(e for e in elements if e["type"] == "relation" and e["id"] == relation_id)
    selected = [ways[m["ref"]] for m in relation["members"] if m["type"] == "way" and m["role"] != "pit_lane"]
    selected = [w for w in selected if "stands" not in w.get("tags", {}).get("name", "").lower()]
    remaining = {w["id"]: w["nodes"] for w in selected}
    chain = remaining.pop(selected[0]["id"]).copy()
    gaps = []
    def gap(a, b):
        na, nb = nodes[a], nodes[b]
        return 111320 * math.hypot((na["lon"]-nb["lon"])*math.cos(math.radians(na["lat"])), na["lat"]-nb["lat"])
    while remaining:
        match = next(((key, n) for key, n in remaining.items() if chain[-1] in [n[0], n[-1]]), None)
        if match is None:
            if chain[-1] == chain[0]:
                break
            candidates = [(gap(chain[-1], end), key, n, end) for key, n in remaining.items() for end in [n[0], n[-1]]]
            distance, key, n, end = min(candidates)
            if distance > 30:
                raise ValueError(f"Open OSM route: nearest unmatched endpoint is {distance:.1f} m away")
            gaps.append({"fromNode": chain[-1], "toNode": end, "straightEstimatedGapM": distance})
            chain.extend(n if n[0] == end else list(reversed(n)))
            remaining.pop(key)
            continue
        key, n = match
        chain.extend((n if n[0] == chain[-1] else list(reversed(n)))[1:])
        remaining.pop(key)
    if chain[0] != chain[-1]:
        raise ValueError("OSM route is not closed")
    return np.array([[nodes[n]["lon"], nodes[n]["lat"]] for n in chain[:-1]], dtype=float), relation, gaps


def resample(points, n=512):
    closed = np.vstack([points, points[0]])
    lengths = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    along = np.r_[0, np.cumsum(lengths)]
    targets = np.arange(n) * along[-1] / n
    return np.column_stack([np.interp(targets, along, closed[:, dim]) for dim in [0, 1]])


def fit(app, geo):
    lon, lat = geo.mean(axis=0)
    factor = 6378137 * math.pi / 180
    factors = np.array([factor * math.cos(math.radians(lat)), factor])
    local = (geo - [lon, lat]) * factors
    a_points, b_points = resample(app), resample(local)
    best = None
    for sign in [1, -1]:
        u = a_points[:, 0] + 1j * a_points[:, 1] * sign
        uc = u - u.mean()
        for reverse in [False, True]:
            v0 = b_points[:, 0] + 1j * b_points[:, 1]
            if reverse:
                v0 = v0[::-1]
            for phase in range(len(u)):
                v = np.roll(v0, phase)
                a = np.sum(np.conj(uc) * (v - v.mean())) / np.sum(np.abs(uc) ** 2)
                b = v.mean() - a * u.mean()
                error = np.abs(a * u + b - v)
                rmse = np.sqrt(np.mean(error ** 2))
                if best is None or rmse < best[0]:
                    best = (rmse, a, b, sign, phase, reverse, float(error.max()))
    rmse, a, b, sign, phase, reverse, maximum = best
    matrix = [[a.real, -a.imag * sign], [a.imag, a.real * sign]]
    return {"estimated": True, "method": "closed-curve similarity least squares; 512 arc-length samples; both orientations and all cyclic phases",
            "referenceLonLat": [lon, lat], "metresPerDegree": factors.tolist(),
            "matrix": matrix, "translation": [b.real, b.imag], "scale": abs(a),
            "rmseM": float(rmse), "maxResidualM": maximum, "phase": phase, "reverse": reverse}


def nearest(points, road):
    end = np.roll(road, -1, axis=0)
    delta = end - road
    diff = points[:, None, :] - road[None, :, :]
    t = np.clip(np.sum(diff * delta[None, :, :], axis=2) / np.maximum(1e-12, np.sum(delta**2, axis=1)), 0, 1)
    return np.linalg.norm(diff - t[:, :, None] * delta[None, :, :], axis=2).min(axis=1)


def places(id, inputs, registration, road):
    elements = {}
    sources = []
    def map_elements(name, depth=0):
        url = "https://api.openstreetmap.org/api/0.6/map.json?bbox=" + MAP_BOUNDS[name]
        try:
            values = download(url, CACHE / (name + ".json"))["elements"]
            sources.append(name)
            return values
        except urllib.error.HTTPError as error:
            if error.code != 400 or depth >= 3:
                raise
            west, south, east, north = map(float, MAP_BOUNDS[name].split(","))
            cx, cy = (west+east)/2, (south+north)/2
            values = []
            for w, s, e, n in [(west,south,cx,cy),(cx,south,east,cy),(west,cy,cx,north),(cx,cy,east,north)]:
                bbox = ",".join(f"{v:.7f}" for v in [w,s,e,n])
                child = "le-mans-2km-" + digest(bbox.encode())[:12]
                MAP_BOUNDS[child] = bbox
                values.extend(map_elements(child, depth+1))
            return values
    for name in inputs:
        for e in map_elements(name):
            elements[e["type"], e["id"]] = e
    nodes = {key[1]: e for key, e in elements.items() if key[0] == "node"}
    matrix = np.array(registration["matrix"])
    inv = np.linalg.inv(matrix)
    result, green, cover = [], [], []
    for e in elements.values():
        tags = e.get("tags", {})
        kind = tags.get("landuse") or tags.get("natural") or tags.get("leisure")
        vegetation = kind in ["forest", "wood", "park"]
        landcover = kind in ["forest", "wood", "park", "grass", "meadow", "farmland", "orchard", "scrub", "water", "basin", "reservoir", "residential", "industrial", "commercial"]
        if e["type"] != "way" or (not landcover and ("building" not in tags or tags["building"] in ["no", "grandstand", "roof"])):
            continue
        ids = e.get("nodes", [])
        if len(ids) < 4 or ids[0] != ids[-1] or any(n not in nodes for n in ids):
            continue
        geo = np.array([[nodes[n]["lon"], nodes[n]["lat"]] for n in ids[:-1]])
        local = (geo - registration["referenceLonLat"]) * registration["metresPerDegree"]
        polygon = (local - registration["translation"]) @ inv.T
        if not np.isfinite(polygon).all() or len(polygon) > (2000 if landcover else 100):
            continue
        if landcover:
            cover.append({"osmWay": e["id"], "polygon": np.round(polygon, 2).tolist(), "kind": kind})
        if vegetation:
            green.append({"osmWay": e["id"], "polygon": np.round(polygon, 2).tolist(), "kind": kind})
            continue
        if "building" not in tags or tags["building"] in ["no", "grandstand", "roof"]:
            continue
        centroid = polygon.mean(axis=0)
        distance = nearest(centroid[None, :], road)[0]
        if distance < 65 or distance > COVERAGE[id] or nearest(polygon, road).min() < 40:
            continue
        signed_area = np.sum(polygon[:, 0] * np.roll(polygon[:, 1], -1) - polygon[:, 1] * np.roll(polygon[:, 0], -1)) / 2
        if not 20 <= abs(signed_area) <= 18000:
            continue
        height, measured = None, False
        try:
            height = float(tags.get("height", "").replace(" m", ""))
            measured = True  # mapped, not independently surveyed
        except ValueError:
            try:
                height = float(tags.get("building:levels", "")) * 3.1
            except ValueError:
                height = {"monaco": 19, "monza": 8, "le-mans": 7}[id] + e["id"] % 5
        height = max(3, min(85, height))
        result.append({"osmWay": e["id"], "polygon": np.round(polygon, 2).tolist(), "heightM": round(height, 2),
                       "heightFromOsmTag": measured, "distanceM": round(float(distance), 2), "kind": tags["building"]})
    result.sort(key=lambda e: (e["distanceM"], e["osmWay"]))
    limit = {"monza": 500, "monaco": 1100, "le-mans": 2000}[id]
    if id == "le-mans":
        # Reserve a share for the extended ring; nearest-first alone can fill
        # the whole budget inside the old 1 km band.
        far = []
        for lower in [1000, 1250, 1500, 1750]:
            far.extend([e for e in result if lower < e["distanceM"] <= lower+250][:200])
        result = [e for e in result if e["distanceM"] <= 1000][:1200] + far
    return result[:limit], green, cover, sources


def read_hgt(directory, name):
    matches = sorted(directory.glob(name + "*.zip"))
    if not matches:
        raise FileNotFoundError(f"Missing original NASA ZIP: {name}.SRTMGL1.hgt.zip in {directory}")
    data = matches[0].read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.testzip() is not None:
            raise ValueError("Corrupt NASA ZIP")
        members = [n for n in archive.namelist() if n.lower().endswith(".hgt")]
        if len(members) != 1:
            raise ValueError("Expected one HGT in NASA ZIP")
        raw = archive.read(members[0])
    if len(raw) != 3601 * 3601 * 2:
        raise ValueError("Expected SRTMGL1: 3601 by 3601 signed big-endian int16")
    return np.frombuffer(raw, dtype=">i2").reshape(3601, 3601).astype(float), {
        "zipSha256": digest(data), "hgtSha256": digest(raw), "hgtBytes": len(raw), "zipBytes": len(data),
        "file": name + ".SRTMGL1.hgt.zip", "dimensions": [3601, 3601], "noData": -32768}


def elevations(road, registration, hgt, name, boundaries, coverage=1000):
    # 32 m display sampling is not a claim of survey accuracy.
    step = 32
    extent = np.vstack([road, *[np.array(ring, dtype=float) for ring in boundaries]])
    # The app's framing bounds add 100 m around the road geometry. Include
    # that existing framing margin plus mesh padding, rather than clamping
    # requests to the edge of a smaller real-data crop.
    lo = np.floor((extent.min(axis=0) - coverage - 250) / step) * step
    hi = np.ceil((extent.max(axis=0) + coverage + 250) / step) * step
    nx, ny = np.ceil((hi - lo) / step).astype(int) + 1
    xx, yy = np.meshgrid(lo[0] + np.arange(nx) * step, lo[1] + np.arange(ny) * step)
    app = np.column_stack([xx.ravel(), yy.ravel()])
    local = app @ np.array(registration["matrix"]).T + registration["translation"]
    geo = local / registration["metresPerDegree"] + registration["referenceLonLat"]
    west, south = int(name[4:7]), int(name[1:3])
    u, v = (geo[:, 0] - west) * 3600, (south + 1 - geo[:, 1]) * 3600
    if (u < 0).any() or (u >= 3600).any() or (v < 0).any() or (v >= 3600).any():
        raise ValueError("Landscape exceeds selected NASA cell")
    ix, iy = np.floor(u).astype(int), np.floor(v).astype(int)
    fx, fy = u - ix, v - iy
    samples = np.array([hgt[iy, ix], hgt[iy, ix+1], hgt[iy+1, ix], hgt[iy+1, ix+1]])
    if (samples == -32768).any():
        raise ValueError("SRTM void in sampled region: do not invent a replacement height")
    values = samples[0]*(1-fx)*(1-fy) + samples[1]*fx*(1-fy) + samples[2]*(1-fx)*fy + samples[3]*fx*fy
    return values.astype("<f4").tobytes(), {"origin": lo.tolist(), "stepM": step, "columns": int(nx), "rows": int(ny),
        "absoluteRangeM": [float(values.min()), float(values.max())], "geoBounds": [*geo.min(axis=0).tolist(), *geo.max(axis=0).tolist()]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--srtm-dir", type=Path)
    parser.add_argument("--fit-only", action="store_true")
    args = parser.parse_args()
    circuits = json.loads((ROOT / "outputs/data/circuits.json").read_bytes())["circuits"]
    catalog, fit_report = {}, {}
    for circuit in circuits:
        id = circuit["id"]
        relation_id, name, maps = DATASETS[id]
        url = f"https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full.json"
        route_file = CACHE / (id + "-route.json")
        route_data = download(url, route_file)
        geo, relation, gaps = route(route_data, relation_id)
        road = np.array(circuit["points"], dtype=float)
        registration = fit(road, geo)
        registration["osmEndpointRepairs"] = gaps
        fit_report[id] = registration
        print(id, "registration RMS(m)", round(registration["rmseM"], 2), "max(m)", round(registration["maxResidualM"], 2), flush=True)
        if args.fit_only:
            continue
        if not args.srtm_dir:
            parser.error("--srtm-dir is required for real elevations")
        hgt, provenance = read_hgt(args.srtm_dir, name)
        metadata = download(CMR + "&producer_granule_id=" + name + ".SRTMGL1.hgt", CACHE / (name + "-cmr.json"))["feed"]["entry"][0]
        provenance.update({"granuleConceptId": metadata["id"], "producerGranuleId": metadata["producer_granule_id"],
            "downloadUrl": next(l["href"] for l in metadata["links"] if not l.get("inherited") and l["rel"].endswith("data#")),
            "doi": DOI, "collectionConceptId": "C2763266360-LPCLOUD", "period": [metadata["time_start"], metadata["time_end"]],
            "format": "HGT int16 big endian, north-to-south rows; 1 arc-second; EGM96 orthometric metres"})
        data, grid = elevations(road, registration, hgt, name, circuit["boundaries"], COVERAGE[id])
        OUTPUT.mkdir(parents=True, exist_ok=True)
        (OUTPUT / (id + ".f32")).write_bytes(data)
        maps = landscape_maps(id, registration, road, circuit["boundaries"], maps)
        buildings, green, cover, maps = places(id, maps, registration, road)
        place_data = {"license": "ODbL-1.0", "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/", "attribution": "© OpenStreetMap contributors", "estimatedRegistration": True, "buildings": buildings, "greenAreas": green, "landCover": cover}
        (OUTPUT / (id + "-places.json")).write_text(json.dumps(place_data, separators=(",", ":")), encoding="utf-8")
        catalog[id] = {"coverageM": COVERAGE[id], "registration": registration, "srtm": provenance, "grid": {**grid, "file": id + ".f32", "sha256": digest(data)},
            "placesFile": id + "-places.json", "osmRoute": {"relationId": relation_id, "url": url, "sha256": digest(route_file.read_bytes())},
            "buildings": len(buildings), "sourceMapFiles": [{"file": m, "url": "https://api.openstreetmap.org/api/0.6/map.json?bbox=" + MAP_BOUNDS[m], "sha256": digest((CACHE / (m + ".json")).read_bytes())} for m in maps]}
        print(id, grid["columns"], grid["rows"], "source range", grid["absoluteRangeM"], "buildings", len(buildings), flush=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE.parent / "registration.json").write_text(json.dumps(fit_report, indent=2), encoding="utf-8")
    if not args.fit_only:
        manifest = {"revision": "nasa-srtm-landscape-2", "source": DOI, "attribution": "NASA JPL SRTMGL1 v003 / LP DAAC; © OpenStreetMap contributors",
                    "notice": "SRTM acquisition February 2000, not a 2026 survey. Estimated similarity registration and near-track blend; decorative buildings.",
                    "circuits": catalog}
        (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
