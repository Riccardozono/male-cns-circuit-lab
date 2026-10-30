"""Actual Windows file sharing tests, not simulated learning outcomes."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import threading
import time
import unittest
import uuid
from neuronal_experiment_io_retry import ROOT, atomic_json

class AtomicWindowsTest(unittest.TestCase):
    def setUp(self):
        self.directory = ROOT/'.impeccable/review/neural-sacl'/('atomic-json-retry-'+uuid.uuid4().hex)
        self.directory.mkdir()
        self.file = self.directory/'state.json'
        atomic_json(self.file, {'before': True})
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
        self.kernel.CreateFileW.restype = wintypes.HANDLE
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.CloseHandle.restype = wintypes.BOOL

    def lock_without_delete_sharing(self):
        handle = self.kernel.CreateFileW(str(self.file), 0x80000000, 3, None, 3, 0, None)
        self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
        return handle

    @unittest.skipUnless(os.name == 'nt', 'Actual Windows sharing semantics required')
    def test_transient_reader_is_retried_and_complete_json_survives(self):
        handle = self.lock_without_delete_sharing()
        timer = threading.Timer(.18, lambda: self.kernel.CloseHandle(handle))
        timer.start()
        start = time.monotonic()
        try:
            atomic_json(self.file, {'after': list(range(100))})
        finally:
            timer.join()
        self.assertGreater(time.monotonic()-start, .1)
        self.assertEqual(json.loads(self.file.read_text()), {'after': list(range(100))})
        self.assertEqual(list(self.directory.glob('*.pending')), [])

    @unittest.skipUnless(os.name == 'nt', 'Actual Windows sharing semantics required')
    def test_persistent_lock_raises_without_damaging_previous_state(self):
        handle = self.lock_without_delete_sharing()
        try:
            with self.assertRaises(PermissionError):
                atomic_json(self.file, {'mustNotReplace': True}, attempts=2, delay=.01)
        finally:
            self.kernel.CloseHandle(handle)
        self.assertEqual(json.loads(self.file.read_text()), {'before': True})
        self.assertEqual(list(self.directory.glob('*.pending')), [])

if __name__ == '__main__':
    unittest.main()
