"""Atomic MicroPython file replacement used by the future PlotterFlow uploader.

The staging-and-digest flow follows the proven Pico Blocks Studio updater
contract: incomplete uploads never replace the previous file.
"""

import hashlib
import os


def atomic_write(path, payload, expected_sha256=None):
    if not isinstance(payload, bytes):
        raise TypeError("payload must be bytes")
    digest = hashlib.sha256(payload).hexdigest()
    if expected_sha256 is not None and digest != expected_sha256:
        raise ValueError("SHA-256 mismatch")
    temp = path + ".tmp"
    with open(temp, "wb") as target:
        target.write(payload)
    os.rename(temp, path)
    try:
        os.sync()
    except AttributeError:
        pass
    return digest