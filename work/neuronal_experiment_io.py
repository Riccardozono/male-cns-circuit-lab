"""Pinned numerical processes; concurrent startup, no Torch/GPU import needed."""
import hashlib
import json
import os
from pathlib import Path
import queue
import subprocess
import threading

ROOT = Path(__file__).resolve().parent.parent
NODE = ROOT / '.impeccable/runtime-node24/node.exe'

def file_hash(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()

def atomic_json(file, value):
    file = Path(file)
    pending = file.with_name(file.name + '.pending')
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(pending, file)

class Pipe:
    def __init__(self, script, initialization=None):
        if not NODE.is_file():
            raise RuntimeError('Pinned Node24 numerical executable missing')
        self.responses = queue.Queue()
        self.request_id, self.closed, self.stderr = 0, False, ''
        self.process = subprocess.Popen([str(NODE), str(script)], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, encoding='utf-8', bufsize=1, creationflags=subprocess.CREATE_NO_WINDOW)
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.error_reader = threading.Thread(target=self._read_error, daemon=True)
        self.reader.start()
        self.error_reader.start()
        try:
            self.metadata = self.request('init', **(initialization or {}))
        except Exception:
            self.close()
            raise

    def _read(self):
        for line in self.process.stdout:
            try:
                self.responses.put(json.loads(line))
            except Exception as error:
                self.responses.put({'error': str(error)})
        self.responses.put({'error': 'Numerical transport ended', 'exit': self.process.poll()})

    def _read_error(self):
        for line in self.process.stderr:
            self.stderr = (self.stderr + line)[-8192:]

    def send(self, op, **fields):
        self.request_id += 1
        self.process.stdin.write(json.dumps({'id': self.request_id, 'op': op, **fields}) + '\n')
        self.process.stdin.flush()
        return self.request_id

    def receive(self, request_id):
        result = self.responses.get(timeout=240)
        if result.get('error'):
            raise RuntimeError(result['error'] + '\n' + self.stderr)
        if result.get('id') != request_id:
            raise RuntimeError('Out-of-order numerical response')
        return result['result']

    def request(self, op, **fields):
        return self.receive(self.send(op, **fields))

    def close(self):
        if self.closed:
            return
        self.closed = True
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=5)
        self.reader.join(timeout=1)
        self.error_reader.join(timeout=1)
        for stream in [self.process.stdin, self.process.stdout, self.process.stderr]:
            if stream and not stream.closed:
                stream.close()
