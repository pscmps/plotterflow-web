"""r2 active-low contact inputs. Command-boundary checks, NOT a hard limit ISR."""
try:
    from machine import Pin
except ImportError:
    Pin = None
try:
    from time import ticks_ms, ticks_diff
except ImportError:
    from time import monotonic
    def ticks_ms():
        return int(monotonic() * 1000)
    def ticks_diff(a, b):
        return a - b


class Contact:
    def __init__(self, number, debounce_ms=20):
        self.pin = Pin(number, Pin.IN, Pin.PULL_UP) if Pin and number is not None else None
        self.raw = self.stable = bool(self.pin and self.pin.value() == 0)
        self.changed_at = ticks_ms()
        self.debounce_ms = debounce_ms

    def sample(self):
        raw = bool(self.pin and self.pin.value() == 0)
        now = ticks_ms()
        if raw != self.raw:
            self.raw, self.changed_at = raw, now
        if ticks_diff(now, self.changed_at) >= self.debounce_ms:
            self.stable = raw
        return self.stable

    def blocked(self):
        self.sample()
        # Block on the first observed LOW; allow release only after stable HIGH.
        if self.raw:
            self.stable = True
        return self.raw or self.stable


class BoardInputs:
    def __init__(self, config):
        debounce = getattr(config, 'INPUT_DEBOUNCE_MS', 20)
        if not getattr(config, 'LIMIT_PULL_UP', True) or not getattr(config, 'LIMIT_ACTIVE_LOW', True):
            raise ValueError('r2 requires pull-up / active-low limits')
        self.limits = {axis: Contact(getattr(config, axis + '_LIMIT', None), debounce) for axis in ('X', 'Y')}
        # NC buttons stay untouched, in particular the Touch-LCD-2 compact pins.
        self.buttons = {name: Contact(getattr(config, name, None), debounce)
                        for name in ('BUTTON_UP', 'BUTTON_DOWN', 'BUTTON_OK')}

    def blocked(self):
        states = [contact.blocked() for contact in self.limits.values()]
        return any(states)

    def report(self):
        return ' '.join('%s:%s' % (axis, 'NC' if contact.pin is None else
                                  'TRIGGERED' if contact.blocked() else 'OPEN')
                        for axis, contact in self.limits.items())
