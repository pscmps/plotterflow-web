"""Hobby PWM pen servo (50 Hz, pulse width in microseconds)."""

try:
    from machine import Pin, PWM
except ImportError:  # host tests
    Pin = PWM = None


class Pen:
    def __init__(self, pin, frequency=50, up_us=1400, down_us=1000, delay_ms=150):
        self.up_us, self.down_us, self.delay_ms = int(up_us), int(down_us), int(delay_ms)
        self.period_us = 1_000_000 // frequency
        self.pwm = PWM(Pin(pin)) if PWM else None
        if self.pwm:
            self.pwm.freq(frequency)
        self.is_down = None
        self.us = None
        self.up()

    def set_us(self, value):
        value = max(500, min(2500, int(value)))
        self.us = value
        if self.pwm:
            if hasattr(self.pwm, "duty_ns"):
                self.pwm.duty_ns(value * 1000)
            else:
                self.pwm.duty_u16(value * 65535 // self.period_us)

    def up(self):
        self.set_us(self.up_us)
        self.is_down = False

    def down(self):
        self.set_us(self.down_us)
        self.is_down = True
