"""Lossless bounded local experiment records; exact JSON floats, stable gzip."""
import gzip
import json
import os
import tempfile
import time
from pathlib import Path
from neuronal_experiment_io_retry import ROOT

def atomic_record(file,value):
    file = Path(file)
    assert file.resolve().is_relative_to((ROOT/'.impeccable/review/neural-sacl').resolve())
    assert file.suffix == '.gz' and file.parent.is_dir()
    payload = gzip.compress(json.dumps(value,separators=(',',':')).encode('utf-8'),compresslevel=1,mtime=0)
    descriptor,name = tempfile.mkstemp(prefix=file.name+'.',suffix='.pending',dir=file.parent)
    pending = Path(name)
    try:
        with os.fdopen(descriptor,'wb') as stream:
            stream.write(payload)
        for attempt in range(80):
            try:
                os.replace(pending,file)
                return
            except PermissionError as error:
                if os.name != 'nt' or getattr(error,'winerror',None) not in (5,32,33) or attempt == 79:
                    raise
                time.sleep(min(.1,.02*(attempt+1)))
    finally:
        pending.unlink(missing_ok=True)

def read_record(file):
    with gzip.open(file,'rt',encoding='utf-8') as stream:
        return json.load(stream)
