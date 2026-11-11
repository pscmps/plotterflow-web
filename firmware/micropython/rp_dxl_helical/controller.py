"""PlotterFlow line protocol for the helical differential XL330 plotter.

submit(line) returns the reply text ("ok", "error:...", possibly preceded by
report lines) or None when the line cannot run yet (queue full, waiting for
motion to finish, pen settling). The caller keeps the line and retries, so
the host only sees "ok" once the line has really been accepted.
"""

from clock import ticks_add, ticks_diff, ticks_ms
from gcode import parse
from servo_backend import ServoError

INCH = 25.4
FIRMWARE = "PlotterFlow MicroPython XL330 Helical"
CAPS = "G0,G1,G4,G10,G20,G21,G28,G90,G91,G92,M3,M5,M17,M18,M20,M21,M22,M23,M24,M28,M29,M30,M114,M115,M203,M204,M220,M281,M400,M993,STOP"


class Controller:
    def __init__(self, motion, backend, pen, sd, cfg, clock_ms=ticks_ms):
        self.motion = motion
        self.kin = motion.kin
        self.backend = backend
        self.pen = pen
        self.sd = sd
        self.cfg = cfg
        self.clock_ms = clock_ms
        self.absolute = True
        self.mm = True
        self.motion_mode = "G0"
        self.feed = cfg.DEFAULT_FEED_MM_MIN / 60.0
        self.rapid = cfg.RAPID_FEED_MM_MIN / 60.0
        self.max_feed = cfg.MAX_FEED_MM_MIN / 60.0
        self.override = 1.0
        self.z_threshold = cfg.PEN_Z_THRESHOLD
        self.ox = self.oy = 0.0
        self.z = 1.0
        self.wait_until = None
        self.sd_mode = False
        self.job_starter = None  # set by the app: callable(name or None) -> reply
        self._pending = None     # (line, plan) cached while a line is retried

    # ----- helpers -----------------------------------------------------
    def now(self):
        return self.clock_ms()

    def _wait(self, ms):
        self.wait_until = ticks_add(self.now(), int(ms))

    def work_position(self):
        return self.motion.x - self.ox, self.motion.y - self.oy

    def enable(self):
        a, b = self.backend.enable()
        self.motion.max_motor_rev_s = self.backend.max_rev_s()
        x, y = self.kin.to_xy(a, b)
        self.motion.set_position(x, y)

    def disable(self):
        self.motion.stop()
        self.backend.disable()

    def stop(self):
        """Realtime 0x85: drop queued motion and lift the pen."""
        self.motion.stop()
        self._pending = None
        self.wait_until = None
        self.pen.up()
        self.z = 1.0

    def cancel_upload(self):
        return self.sd.cancel_upload()

    def idle(self):
        return not self.motion.busy() and self.wait_until is None

    # ----- entry point -------------------------------------------------
    def submit(self, line):
        if self.wait_until is not None:
            if ticks_diff(self.now(), self.wait_until) < 0:
                return None
            self.wait_until = None
        if self.sd.upload is not None:
            return self._upload_line(line)
        try:
            reply = self._dispatch(line)
        except ServoError as error:
            self.disable()
            reply = "error:servo:" + str(error)
        except (ValueError, OSError) as error:
            reply = "error:" + str(error)
        if reply is not None:
            self._pending = None
        return reply

    def _upload_line(self, line):
        text = line.rstrip("\r\n")
        if text.strip().upper() == "M29":
            name = self.sd.finish_upload()
            return "[MSG:SD saved {}]\nok".format(name)
        self.sd.write_line(text)
        return "ok"

    def _dispatch(self, line):
        stripped = line.strip()
        if not stripped or stripped[0] == "$":
            return "ok"
        command, words, rest = parse(stripped)
        if not command:
            if not words:
                return "ok"
            command = self.motion_mode
        if command in ("G0", "G1"):
            return self._move(line, command, words)
        handler = getattr(self, "_" + command.lower(), None)
        if handler is None:
            return "error:unsupported:" + command
        return handler(words, rest)

    # ----- motion ------------------------------------------------------
    def _plan(self, command, words):
        unit = 1.0 if self.mm else INCH
        wx, wy = self.motion.tail_x - self.ox, self.motion.tail_y - self.oy
        tx, ty, tz = wx, wy, self.z
        if "X" in words:
            tx = words["X"] * unit + (0.0 if self.absolute else wx)
        if "Y" in words:
            ty = words["Y"] * unit + (0.0 if self.absolute else wy)
        if "Z" in words:
            tz = words["Z"] * unit + (0.0 if self.absolute else self.z)
        feed = self.feed
        if "F" in words:
            if words["F"] <= 0:
                raise ValueError("bad_feed")
            feed = words["F"] * unit / 60.0
        mx, my = tx + self.ox, ty + self.oy
        c = self.cfg
        if not (c.X_MIN_MM <= mx <= c.X_MAX_MM and c.Y_MIN_MM <= my <= c.Y_MAX_MM):
            raise ValueError("soft_limit")
        return mx, my, tz, feed, ("X" in words or "Y" in words), ("Z" in words)

    def _move(self, line, command, words):
        if self._pending and self._pending[0] == line:
            plan = self._pending[1]
        else:
            plan = self._plan(command, words)
            self._pending = (line, plan)
        mx, my, tz, feed, has_xy, has_z = plan
        if not self.backend.enabled:
            if self.motion.busy():
                return None
            self.enable()
        if has_z:
            want_down = tz <= self.z_threshold
            if want_down != self.pen.is_down:
                if self.motion.busy():
                    return None
                (self.pen.down if want_down else self.pen.up)()
                self.z = tz
                self._wait(self.pen.delay_ms)
                return None if has_xy else self._commit(command, feed)
            self.z = tz
        if has_xy:
            speed = self.rapid if command == "G0" else feed
            speed = min(speed * self.override, self.max_feed)
            if not self.motion.enqueue(mx, my, speed):
                return None
        return self._commit(command, feed)

    def _commit(self, command, feed):
        self.motion_mode = command
        self.feed = feed
        return "ok"

    def _g4(self, words, rest):
        if self.motion.busy():
            return None
        ms = words.get("P", 0.0) + words.get("S", 0.0) * 1000.0
        if ms > 0:
            self._wait(ms)
        return "ok"

    def _noop(self, words, rest):
        return "ok"

    _g17 = _g54 = _g94 = _m2 = _noop

    def _g20(self, words, rest):
        self.mm = False
        return "ok"

    def _g21(self, words, rest):
        self.mm = True
        return "ok"

    def _g90(self, words, rest):
        self.absolute = True
        return "ok"

    def _g91(self, words, rest):
        self.absolute = False
        return "ok"

    def _g92(self, words, rest):
        if self.motion.busy():
            return None
        unit = 1.0 if self.mm else INCH
        if "X" in words:
            self.ox = self.motion.x - words["X"] * unit
        if "Y" in words:
            self.oy = self.motion.y - words["Y"] * unit
        if "Z" in words:
            self.z = words["Z"] * unit
        return "ok"

    def _g10(self, words, rest):
        if words.get("L") != 20:
            return "error:unsupported:G10"
        return self._g92(words, rest)

    def _g28(self, words, rest):
        if not self.backend.enabled:
            if self.motion.busy():
                return None
            self.enable()
        if not self.motion.enqueue(0.0, 0.0, min(self.rapid * self.override, self.max_feed)):
            return None
        return "ok"

    # ----- machine state -----------------------------------------------
    def _m17(self, words, rest):
        if self.motion.busy():
            return None
        self.enable()
        return "ok"

    def _m18(self, words, rest):
        if self.motion.busy():
            return None
        self.backend.disable()
        return "ok"

    _m84 = _m18

    def _m400(self, words, rest):
        return None if self.motion.busy() else "ok"

    def _m3(self, words, rest):
        if self.motion.busy():
            return None
        s = words.get("S")
        if s is not None and s >= 500:
            self.pen.set_us(s)
            self.pen.is_down = abs(s - self.pen.down_us) < abs(s - self.pen.up_us)
        else:
            self.pen.down()
        self.z = 0.0 if self.pen.is_down else 1.0
        self._wait(self.pen.delay_ms)
        return "ok"

    def _m5(self, words, rest):
        if self.motion.busy():
            return None
        self.pen.up()
        self.z = 1.0
        self._wait(self.pen.delay_ms)
        return "ok"

    def _m281(self, words, rest):
        p = self.pen
        if "U" in words:
            p.up_us = int(words["U"])
        if "D" in words:
            p.down_us = int(words["D"])
        if "T" in words:
            p.delay_ms = int(words["T"])
        if "Z" in words:
            self.z_threshold = words["Z"]
        if not self.motion.busy() and p.is_down is not None:
            (p.down if p.is_down else p.up)()
        return "ok"

    def _m220(self, words, rest):
        if "S" in words:
            self.override = max(0.1, min(3.0, words["S"] / 100.0))
        return "[MSG:speed override {}%]\nok".format(int(self.override * 100))

    def _m203(self, words, rest):
        value = words.get("S", words.get("F"))
        if value is not None:
            if value <= 0:
                raise ValueError("bad_feed")
            self.max_feed = value / 60.0
        return "[MSG:max feed {} mm/min]\nok".format(int(self.max_feed * 60))

    def _m204(self, words, rest):
        value = words.get("S", words.get("P"))
        if value is not None:
            if value <= 0:
                raise ValueError("bad_accel")
            self.motion.accel = float(value)
        return "[MSG:accel {} mm/s2]\nok".format(int(self.motion.accel))

    def _m114(self, words, rest):
        wx, wy = self.work_position()
        a, b = self.kin.to_pulses(self.motion.x, self.motion.y)
        return "X:{:.3f} Y:{:.3f} Z:{:.3f} A:{} B:{} MX:{:.3f} MY:{:.3f}\nok".format(
            wx, wy, self.z, a, b, self.motion.x, self.motion.y)

    def _m115(self, words, rest):
        return "FIRMWARE_NAME:{} BOARD:{} caps={}\nok".format(FIRMWARE, self.cfg.BOARD, CAPS)

    # ----- SD card -----------------------------------------------------
    def _m21(self, words, rest):
        self.sd.ensure()
        self.sd_mode = True
        return "[MSG:SDMODE active=1]\nok"

    def _m22(self, words, rest):
        self.sd_mode = False
        return "[MSG:SDMODE active=0]\nok"

    def _m20(self, words, rest):
        files = self.sd.files()
        out = ["[SDLIST:BEGIN]"]
        for name, size in files:
            out.append("[SDLIST:FILE name={} size={}]".format(name, size))
        out.append("[SDLIST:END count={}]".format(len(files)))
        out.append("ok")
        return "\n".join(out)

    def _m28(self, words, rest):
        if self.motion.busy():
            return None
        self.sd.begin_upload(rest.strip())
        return "ok"

    def _m29(self, words, rest):
        return "error:no_upload"

    def _m30(self, words, rest):
        if not rest.strip():
            return "ok"  # program end without a file name
        self.sd.delete(rest.strip())
        return "ok"

    def _m993(self, words, rest):
        parts = rest.split()
        if len(parts) != 2:
            raise ValueError("usage:M993 old new")
        self.sd.rename(parts[0], parts[1])
        return "ok"

    def _m23(self, words, rest):
        return self._m24(words, rest)

    def _m24(self, words, rest):
        if self.job_starter is None:
            return "error:no_job_runner"
        if self.motion.busy():
            return None
        return self.job_starter(rest.strip() or None)
