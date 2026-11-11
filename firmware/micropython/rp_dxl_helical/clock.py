"""time.ticks_* on MicroPython, monotonic fallbacks on CPython (host tests)."""

try:
    from time import ticks_ms, ticks_us, ticks_diff, ticks_add, sleep_ms  # noqa: F401
except ImportError:  # CPython
    import time as _time

    def ticks_ms():
        return int(_time.monotonic() * 1000)

    def ticks_us():
        return int(_time.monotonic() * 1_000_000)

    def ticks_diff(a, b):
        return a - b

    def ticks_add(a, b):
        return a + b

    def sleep_ms(ms):
        _time.sleep(ms / 1000)
