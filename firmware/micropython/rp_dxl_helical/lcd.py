"""ST7789 240x135 on the RP2350-GEEK, framebuf based.

Init sequence and offsets follow the RP2040/RP2350-GEEK C firmware in
pscmps/dynamixel-pio-xl330-m077-t-rp2040 (MADCTL 0x70, offset 40/53).
"""

import framebuf
from machine import Pin, SPI
import time

from colors import BLACK

WIDTH = 240
HEIGHT = 135


class LCD(framebuf.FrameBuffer):
    def __init__(self, cfg):
        self.buffer = bytearray(WIDTH * HEIGHT * 2)
        super().__init__(self.buffer, WIDTH, HEIGHT, framebuf.RGB565)
        self.spi = SPI(cfg.LCD_SPI_ID, 24_000_000, polarity=0, phase=0,
                       sck=Pin(cfg.LCD_SCK_PIN), mosi=Pin(cfg.LCD_MOSI_PIN))
        self.dc = Pin(cfg.LCD_DC_PIN, Pin.OUT, value=1)
        self.cs = Pin(cfg.LCD_CS_PIN, Pin.OUT, value=1)
        self.rst = Pin(cfg.LCD_RST_PIN, Pin.OUT, value=1)
        self.bl = Pin(cfg.LCD_BL_PIN, Pin.OUT, value=0)
        self.xo, self.yo = cfg.LCD_X_OFFSET, cfg.LCD_Y_OFFSET
        self._init()
        self.fill(BLACK)
        self.show()
        self.bl.value(1)

    def _cmd(self, command, data=None):
        self.cs(0)
        self.dc(0)
        self.spi.write(bytes((command,)))
        if data:
            self.dc(1)
            self.spi.write(data)
        self.cs(1)

    def _init(self):
        self.rst(0)
        time.sleep_ms(20)
        self.rst(1)
        time.sleep_ms(120)
        self._cmd(0x01)
        time.sleep_ms(150)
        self._cmd(0x11)
        time.sleep_ms(120)
        self._cmd(0x3A, b"\x55")
        self._cmd(0x36, b"\x70")
        self._cmd(0x21)
        self._cmd(0x13)
        self._cmd(0x29)
        time.sleep_ms(20)

    def _window(self, x, y, w, h):
        x0, y0 = x + self.xo, y + self.yo
        x1, y1 = x0 + w - 1, y0 + h - 1
        self._cmd(0x2A, bytes((x0 >> 8, x0 & 0xFF, x1 >> 8, x1 & 0xFF)))
        self._cmd(0x2B, bytes((y0 >> 8, y0 & 0xFF, y1 >> 8, y1 & 0xFF)))

    def show(self):
        self.show_rows(0, HEIGHT)

    def show_rows(self, y, h):
        """Send only rows y..y+h (contiguous in the buffer) to keep it short."""
        y = max(0, y)
        h = min(h, HEIGHT - y)
        if h <= 0:
            return
        self._window(0, y, WIDTH, h)
        self.cs(0)
        self.dc(0)
        self.spi.write(b"\x2C")
        self.dc(1)
        self.spi.write(memoryview(self.buffer)[y * WIDTH * 2:(y + h) * WIDTH * 2])
        self.cs(1)
