"""RGB565 colours, byte-swapped for framebuf -> ST7789."""


def color(r, g, b):
    value = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
    return ((value & 0xFF) << 8) | (value >> 8)


BLACK = color(0, 0, 0)
WHITE = color(255, 255, 255)
GREY = color(120, 120, 120)
GREEN = color(40, 200, 90)
RED = color(230, 60, 50)
YELLOW = color(240, 200, 40)
BLUE = color(40, 110, 230)
