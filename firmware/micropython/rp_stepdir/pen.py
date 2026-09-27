try:
    from machine import Pin, PWM
except ImportError:
    Pin = PWM = None


class Pen:
    def __init__(self, pin, frequency=50, up_us=1000, down_us=1800):
        self.up_us, self.down_us = int(up_us), int(down_us)
        self.pin_number = pin
        self.frequency = int(frequency)
        self.pin = Pin(pin, Pin.OUT, value=0) if Pin else None
        self.pwm = PWM(self.pin, freq=self.frequency, duty_u16=0) if PWM else None
        # R6 was removed in r2: stay LOW, do not move the servo on startup.

    def off(self):
        if self.pwm:
            self.pwm.duty_u16(0)
            self.pwm.deinit()
            self.pin.init(Pin.OUT, value=0)

    def _set_us(self, value):
        if not self.pwm:
            return
        if hasattr(self.pwm, "duty_ns"):
            self.pwm.duty_ns(int(value) * 1000)
        else:
            self.pwm.duty_u16(int(value * self.frequency * 65535 / 1000000))

    def up(self):
        self._set_us(self.up_us)

    def down(self):
        self._set_us(self.down_us)
