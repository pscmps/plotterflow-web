"""Waveshare RP2350-GEEK + XL330-M077-T helical differential pen plotter.

Values marked "calibrate" must be confirmed on the real machine.
"""

BOARD = "rp2350-geek-xl330-helical"
BOARD_NAME = "Waveshare RP2350-GEEK"

# DYNAMIXEL bus. The baud rate is intentionally left at the factory value.
DXL_DATA_PIN = 2
DXL_BAUDRATE = 57_600
DXL_TIMEOUT_MS = 100
A_ID = 1  # Shaft A: meshes with C, drives the carriage (Y) differentially.
B_ID = 2  # Shaft B: fixed nut, drives the gantry (X).
# Operating Mode 4 (Extended Position) is required. Writing it touches EEPROM,
# so it is only done when the servo reports another mode.
AUTO_SET_EXTENDED_MODE = True

# Kinematics: X = B, Y = A - B (README of the helical drive).
LEAD_MM = 40.045               # mm per shaft revolution (A, B and C).
PULSES_PER_REV = 4096
A_DIRECTION = 1                # calibrate: flip to -1 if A turns the wrong way.
B_DIRECTION = 1                # calibrate: flip to -1 if X moves backwards.
COUPLING_SIGN = 1              # calibrate: flip if carriage drifts when only X moves.

# Soft limits relative to the power-on origin (mechanism aligned by hand).
X_MIN_MM = -90.0
X_MAX_MM = 90.0
Y_MIN_MM = -75.0
Y_MAX_MM = 75.0

# Motion. All are adjustable at runtime with M203/M204/M220.
DEFAULT_FEED_MM_MIN = 1500.0
RAPID_FEED_MM_MIN = 6000.0
MAX_FEED_MM_MIN = 12000.0
ACCEL_MM_S2 = 800.0
JUNCTION_DEVIATION_MM = 0.05
MOTOR_MAX_RPM = 90.0           # also clamped by each servo's Velocity Limit.
SLICE_MS = 30                  # one Sync Write of goal + velocity per slice.
VELOCITY_MARGIN = 1.15         # profile velocity headroom per slice.
QUEUE_SIZE = 32

# Pen: hobby PWM servo on a spare GPIO.
PEN_PWM_PIN = 28
PEN_PWM_FREQ = 50
PEN_UP_US = 1400
PEN_DOWN_US = 1000
PEN_DELAY_MS = 150
PEN_Z_THRESHOLD = 0.5          # Z <= threshold means pen down.

# On-board LCD (ST7789 240x135), TF card and buttons.
LCD_SPI_ID = 1
LCD_SCK_PIN = 10
LCD_MOSI_PIN = 11
LCD_DC_PIN = 8
LCD_CS_PIN = 9
LCD_RST_PIN = 12
LCD_BL_PIN = 25
LCD_X_OFFSET = 40
LCD_Y_OFFSET = 53

SD_SPI_ID = 0
SD_SCK_PIN = 18
SD_MOSI_PIN = 19
SD_MISO_PIN = 20
SD_CS_PIN = 23
SD_MOUNT = "/sd"

BUTTON_UP_PIN = 3
BUTTON_DOWN_PIN = 4
BUTTON_ENTER_PIN = 5
BUTTON_DEBOUNCE_MS = 20
CANCEL_HOLD_MS = 1000

USB_BAUDRATE = 115_200  # informational; USB CDC ignores it.
