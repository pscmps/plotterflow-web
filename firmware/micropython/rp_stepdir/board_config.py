"""Board recipe. Copy/replace this file for another RP2040/RP2350 board.

The PlotterFlow Motor Shield v0.7 (Pico 2 W) recipe uses the same STEP/DIR
pins below and additionally reserves the limit, button, UART and servo DATA
signals for later backends.
"""

BOARD = "pico2-stepdir"
X_STEP = 2
X_DIR = 4
Y_STEP = 3
Y_DIR = 5
ENABLE = 7
PEN_PWM = 12
X_LIMIT = 6
Y_LIMIT = 8
BUTTON_UP = 9
BUTTON_DOWN = 10
BUTTON_OK = 11
TMC_UART_TX = 0
TMC_UART_RX = 1
SERIAL_DATA_GPIO = 13

ENABLE_ACTIVE_LOW = True
STEPS_PER_MM_X = 80.0
STEPS_PER_MM_Y = 80.0
MAX_FEED_MM_MIN = 2400.0
PEN_UP_US = 1000
PEN_DOWN_US = 1800
PEN_PWM_FREQ = 50
