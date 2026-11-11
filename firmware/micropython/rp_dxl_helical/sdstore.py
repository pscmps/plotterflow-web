"""G-code files in the SD card root, PlotterFlow M20/M28/M29/M30/M993 style."""

import os

EXTENSIONS = (".gcode", ".gc", ".nc", ".tap")
NAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-"
MAX_NAME = 48


def valid_name(name):
    if not name or len(name) > MAX_NAME or name[0] == ".":
        return False
    for ch in name:
        if ch not in NAME_CHARS:
            return False
    lower = name.lower()
    for ext in EXTENSIONS:
        if lower.endswith(ext):
            return True
    return False


def _exists(path):
    try:
        os.stat(path)
        return True
    except OSError:
        return False


class SdStore:
    def __init__(self, root="/sd", mount=None):
        self.root = root.rstrip("/")
        self._mount = mount  # callable that mounts the card, or None if always present
        self.mounted = mount is None
        self.upload = None
        self.upload_name = None

    def path(self, name):
        return self.root + "/" + name

    def ensure(self):
        if not self.mounted:
            self._mount()
            self.mounted = True

    def unmount_hint(self):
        """Call after card errors so the next access mounts again."""
        if self._mount is not None:
            self.mounted = False

    def files(self):
        self.ensure()
        result = []
        for name in os.listdir(self.root):
            if not valid_name(name):
                continue
            try:
                size = os.stat(self.path(name))[6]
            except OSError:
                continue
            result.append((name, size))
        result.sort()
        return result

    # ----- upload (M28 ... M29) -----
    def begin_upload(self, name):
        if not valid_name(name):
            raise ValueError("bad_filename")
        self.ensure()
        self.cancel_upload()
        self.upload_name = name
        self.upload = open(self.path(name + ".part"), "w")

    def write_line(self, line):
        self.upload.write(line)
        self.upload.write("\n")

    def finish_upload(self):
        if self.upload is None:
            raise ValueError("no_upload")
        name = self.upload_name
        self.upload.close()
        self.upload = None
        self.upload_name = None
        final = self.path(name)
        if _exists(final):
            os.remove(final)
        os.rename(final + ".part", final)
        return name

    def cancel_upload(self):
        if self.upload is None:
            return False
        name = self.upload_name
        try:
            self.upload.close()
        except Exception:
            pass
        self.upload = None
        self.upload_name = None
        try:
            os.remove(self.path(name + ".part"))
        except OSError:
            pass
        return True

    def delete(self, name):
        if not valid_name(name):
            raise ValueError("bad_filename")
        self.ensure()
        os.remove(self.path(name))

    def rename(self, old, new):
        if not valid_name(old) or not valid_name(new):
            raise ValueError("bad_filename")
        self.ensure()
        if not _exists(self.path(old)):
            raise ValueError("not_found")
        if _exists(self.path(new)):
            raise ValueError("exists")
        os.rename(self.path(old), self.path(new))

    def open(self, name):
        if not valid_name(name):
            raise ValueError("bad_filename")
        self.ensure()
        return open(self.path(name), "r")
