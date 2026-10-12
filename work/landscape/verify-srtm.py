"""Independent original-HGT check against the committed derived crop."""
import argparse
import hashlib
import json
from pathlib import Path
import random
import struct
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--srtm-dir", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
folder = root / "outputs/data/landscape"
manifest = json.loads((folder / "manifest.json").read_bytes())
result = {}
for id, entry in manifest["circuits"].items():
    original = (args.srtm_dir / entry["srtm"]["file"]).read_bytes()
    assert hashlib.sha256(original).hexdigest() == entry["srtm"]["zipSha256"]
    with zipfile.ZipFile(args.srtm_dir / entry["srtm"]["file"]) as archive:
        assert archive.testzip() is None
        raw = archive.read(next(n for n in archive.namelist() if n.lower().endswith(".hgt")))
    assert hashlib.sha256(raw).hexdigest() == entry["srtm"]["hgtSha256"]
    derived = (folder / entry["grid"]["file"]).read_bytes()
    assert hashlib.sha256(derived).hexdigest() == entry["grid"]["sha256"]
    rng = random.Random(5127)
    grid, reg = entry["grid"], entry["registration"]
    name = entry["srtm"]["producerGranuleId"]
    south, west = int(name[1:3]), int(name[4:7])
    maximum_error = 0
    for _ in range(500):
        ix, iy = rng.randrange(grid["columns"]), rng.randrange(grid["rows"])
        x, y = grid["origin"][0]+ix*grid["stepM"], grid["origin"][1]+iy*grid["stepM"]
        lon = reg["referenceLonLat"][0]+(reg["matrix"][0][0]*x+reg["matrix"][0][1]*y+reg["translation"][0])/reg["metresPerDegree"][0]
        lat = reg["referenceLonLat"][1]+(reg["matrix"][1][0]*x+reg["matrix"][1][1]*y+reg["translation"][1])/reg["metresPerDegree"][1]
        u, v = (lon-west)*3600, (south+1-lat)*3600
        cx, cy = int(u), int(v)
        fx, fy = u-cx, v-cy
        h = lambda i, j: struct.unpack_from(">h", raw, 2*(j*3601+i))[0]
        expected = h(cx,cy)*(1-fx)*(1-fy)+h(cx+1,cy)*fx*(1-fy)+h(cx,cy+1)*(1-fx)*fy+h(cx+1,cy+1)*fx*fy
        actual = struct.unpack_from("<f", derived, 4*(iy*grid["columns"]+ix))[0]
        maximum_error = max(maximum_error, abs(expected-actual))
        assert abs(expected-actual)<.00005
    result[id] = {"samples":500,"maximumFloat32ErrorM":maximum_error,"originalZipAndHgtHashesMatch":True}
print(json.dumps({"passed":True,"circuits":result}))
