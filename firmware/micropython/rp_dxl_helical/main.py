"""RP2350-GEEK + XL330 helical differential pen plotter (MicroPython).

USB CDC: PlotterFlow line protocol, "ok" per accepted line, 0x85 = stop,
0x18 = cancel SD upload. Ctrl-C still breaks into the REPL so PlotterFlow can
update the files; torque is released on the way out.
"""

import select
import sys
import time

from machine import Pin, SPI

import board_config as cfg
from app import App
from controller import Controller
from kinematics import HelicalDiffKinematics
from motion import Motion
from pen import Pen
from pio_halfduplex import PIOHalfDuplexUART
from sdstore import SdStore
from servo_backend import XL330PairBackend
from ui import UI, Buttons
from xl330 import XL330Bus


def out(text):
    sys.stdout.write(text + "\n")


def mount_sd():
    import os
    import sdcard

    spi = SPI(cfg.SD_SPI_ID, 400_000, sck=Pin(cfg.SD_SCK_PIN), mosi=Pin(cfg.SD_MOSI_PIN), miso=Pin(cfg.SD_MISO_PIN))
    card = sdcard.SDCard(spi, Pin(cfg.SD_CS_PIN, Pin.OUT, value=1), baudrate=12_000_000)
    try:
        os.umount(cfg.SD_MOUNT)
    except OSError:
        pass
    os.mount(card, cfg.SD_MOUNT)


def build():
    transport = PIOHalfDuplexUART(data_pin=cfg.DXL_DATA_PIN, baudrate=cfg.DXL_BAUDRATE, timeout_ms=cfg.DXL_TIMEOUT_MS)
    backend = XL330PairBackend(XL330Bus(transport), cfg.A_ID, cfg.B_ID, cfg.MOTOR_MAX_RPM, cfg.AUTO_SET_EXTENDED_MODE)
    kin = HelicalDiffKinematics(cfg.LEAD_MM, cfg.PULSES_PER_REV, cfg.A_DIRECTION, cfg.B_DIRECTION, cfg.COUPLING_SIGN)
    motion = Motion(kin, backend, cfg.ACCEL_MM_S2, cfg.JUNCTION_DEVIATION_MM, cfg.SLICE_MS,
                    cfg.VELOCITY_MARGIN, cfg.QUEUE_SIZE)
    pen = Pen(cfg.PEN_PWM_PIN, cfg.PEN_PWM_FREQ, cfg.PEN_UP_US, cfg.PEN_DOWN_US, cfg.PEN_DELAY_MS)
    sd = SdStore(cfg.SD_MOUNT, mount_sd)
    controller = Controller(motion, backend, pen, sd, cfg)
    app = App(controller, out)
    return transport, app


def build_ui(app):
    pins = {
        "up": Pin(cfg.BUTTON_UP_PIN, Pin.IN, Pin.PULL_UP),
        "down": Pin(cfg.BUTTON_DOWN_PIN, Pin.IN, Pin.PULL_UP),
        "enter": Pin(cfg.BUTTON_ENTER_PIN, Pin.IN, Pin.PULL_UP),
    }
    buttons = Buttons(lambda name: pins[name].value() == 0, cfg.BUTTON_DEBOUNCE_MS, cfg.CANCEL_HOLD_MS)
    try:
        from lcd import LCD
        return UI(LCD(cfg), buttons, app)
    except Exception as error:
        out("[MSG:LCD disabled ({})]".format(error))
        return None


def run():
    transport, app = build()
    ui = build_ui(app)
    poller = select.poll()
    poller.register(sys.stdin, select.POLLIN)
    stdin = sys.stdin.buffer if hasattr(sys.stdin, "buffer") else sys.stdin
    out("PlotterFlow MicroPython XL330 Helical ready; board={}".format(cfg.BOARD))
    try:
        while True:
            count = 0
            while count < 64 and poller.poll(0):
                data = stdin.read(1)
                if data:
                    app.feed_bytes(data if isinstance(data, (bytes, bytearray)) else data.encode())
                count += 1
            sent = app.step()
            if ui is not None and not sent:
                ui.tick()
            if not count and not sent and not app.lines and app.job is None and not app.controller.motion.busy():
                time.sleep_ms(1)
    finally:
        app.controller.motion.stop()
        app.controller.backend.disable()
        app.controller.pen.up()
        app.controller.sd.cancel_upload()
        transport.close()


run()
