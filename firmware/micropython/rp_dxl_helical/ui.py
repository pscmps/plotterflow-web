"""Three-button SD job menu on the 240x135 LCD.

UP/DOWN select a file, ENTER opens the confirmation, ENTER again starts the
job, UP/DOWN in the confirmation go back. While a job runs, holding ENTER for
CANCEL_HOLD_MS stops it (motion cleared, pen up, torque off).
"""

from clock import ticks_diff, ticks_ms
from colors import BLACK, BLUE, GREEN, GREY, RED, WHITE, YELLOW

ROW_H = 12
LIST_TOP = 28
LIST_ROWS = 8
CHARS = 29  # 8 px font, 240 px wide, 1 px margin


class Buttons:
    """Debounced active-low buttons. read(name) -> True while pressed."""

    def __init__(self, read, debounce_ms=20, hold_ms=1000, clock=ticks_ms):
        self.read = read
        self.debounce = debounce_ms
        self.hold = hold_ms
        self.clock = clock
        self.state = {}
        for name in ("up", "down", "enter"):
            self.state[name] = [False, False, 0, False]  # raw, stable, changed, long_fired

    def poll(self):
        now = self.clock()
        events = []
        for name, s in self.state.items():
            raw = bool(self.read(name))
            if raw != s[0]:
                s[0] = raw
                s[2] = now
            if raw != s[1] and ticks_diff(now, s[2]) >= self.debounce:
                s[1] = raw
                if raw:
                    s[3] = False
                    if name != "enter":
                        events.append(name)
                elif name == "enter" and not s[3]:
                    events.append("enter")
            if name == "enter" and s[1] and not s[3] and ticks_diff(now, s[2]) >= self.hold:
                s[3] = True
                events.append("enter_long")
        return events


class UI:
    def __init__(self, lcd, buttons, app, clock=ticks_ms):
        self.lcd = lcd
        self.buttons = buttons
        self.app = app
        self.clock = clock
        self.screen = "list"
        self.files = []
        self.error = None
        self.index = 0
        self.top = 0
        self.message = ""
        self.last_status = 0
        self.scroll_at = clock()
        self.reload()
        self.draw()

    # ----- data --------------------------------------------------------
    def reload(self):
        try:
            self.files = self.app.controller.sd.files()
            self.error = None
        except Exception as error:
            self.files = []
            self.error = "SD: " + str(error)
            self.app.controller.sd.unmount_hint()
        self.index = min(self.index, max(0, len(self.files) - 1))
        self._sync_selection()

    def _sync_selection(self):
        self.app.selected = self.files[self.index][0] if self.files else None
        self.scroll_at = self.clock()

    # ----- drawing -----------------------------------------------------
    def _header(self, title, colour=BLUE):
        d = self.lcd
        d.fill_rect(0, 0, 240, 12, colour)
        d.text(title[:CHARS], 2, 2, WHITE)

    def _status_text(self):
        c = self.app.controller
        x, y = c.work_position()
        torque = "ON " if c.backend.enabled else "OFF"
        return "TQ {} X{:7.2f} Y{:7.2f}".format(torque, x, y)

    def _status_row(self):
        d = self.lcd
        d.fill_rect(0, 14, 240, 10, BLACK)
        d.text(self._status_text()[:CHARS], 2, 15, GREY)

    def _name_text(self, name, selected):
        if not selected or len(name) <= CHARS - 2:
            return name[:CHARS - 2]
        span = len(name) - (CHARS - 2) + 1
        elapsed = ticks_diff(self.clock(), self.scroll_at) - 800
        offset = 0 if elapsed < 0 else (elapsed // 350) % span
        return name[offset:offset + CHARS - 2]

    def _list_row(self, row):
        d = self.lcd
        i = self.top + row
        y = LIST_TOP + row * ROW_H
        d.fill_rect(0, y, 240, ROW_H, BLACK)
        if i >= len(self.files):
            return
        selected = i == self.index
        if selected:
            d.fill_rect(0, y, 240, ROW_H, WHITE)
        d.text(self._name_text(self.files[i][0], selected), 4, y + 2, BLACK if selected else WHITE)

    def draw(self):
        d = self.lcd
        d.fill(BLACK)
        if self.screen == "list":
            self._header("PlotterFlow XL330 Helical")
            self._status_row()
            if self.error:
                d.text(self.error[:CHARS], 2, LIST_TOP + 4, RED)
                d.text("ENTER: retry", 2, LIST_TOP + 20, GREY)
            elif not self.files:
                d.text("No .gcode/.gc/.nc in root", 2, LIST_TOP + 4, YELLOW)
            else:
                if self.index < self.top:
                    self.top = self.index
                elif self.index >= self.top + LIST_ROWS:
                    self.top = self.index - LIST_ROWS + 1
                for row in range(LIST_ROWS):
                    self._list_row(row)
            d.text("UP/DN select  ENTER open", 2, 126, GREY)
        elif self.screen == "confirm":
            name, size = self.files[self.index]
            self._header("Run this file?", YELLOW)
            d.text(name[:CHARS], 2, 30, WHITE)
            if len(name) > CHARS:
                d.text(name[CHARS:2 * CHARS], 2, 42, WHITE)
            d.text("{} bytes".format(size), 2, 58, GREY)
            d.text("ENTER: start", 2, 90, GREEN)
            d.text("UP/DOWN: back", 2, 104, GREY)
        elif self.screen == "run":
            job = self.app.job
            self._header("RUNNING", GREEN)
            self._status_row()
            if job:
                d.text(job.name[:CHARS], 2, 32, WHITE)
            self._run_line()
            d.text("Hold ENTER 1s to stop", 2, 120, RED)
        elif self.screen == "message":
            self._header("Job finished", GREY)
            d.text(self.message[:CHARS], 2, 32, WHITE)
            d.text(self.message[CHARS:2 * CHARS], 2, 44, WHITE)
            d.text("Any button: back", 2, 120, GREY)
        d.show()

    def _run_line(self):
        d = self.lcd
        job = self.app.job
        d.fill_rect(0, 50, 240, 10, BLACK)
        if job:
            d.text("line {}".format(job.line_no), 2, 50, YELLOW)

    # ----- loop --------------------------------------------------------
    def tick(self):
        for event in self.app.events:
            if event == "job_started":
                self.screen = "run"
                self.draw()
            elif event == "job_finished":
                job = self.app.last_job
                self.message = "{}: {} (line {})".format(job.name, job.result, job.line_no)
                self.screen = "message"
                self.draw()
            elif event == "files_changed" and self.screen == "list":
                self.reload()
                self.draw()
        self.app.events = []
        for event in self.buttons.poll():
            self._button(event)
        now = self.clock()
        if ticks_diff(now, self.last_status) >= 500:
            self.last_status = now
            if self.screen in ("list", "run"):
                self._status_row()
                if self.screen == "run":
                    self._run_line()
                    self.lcd.show_rows(14, 46)
                else:
                    self.lcd.show_rows(14, 10)
        if self.screen == "list" and self.files and len(self.files[self.index][0]) > CHARS - 2:
            row = self.index - self.top
            if 0 <= row < LIST_ROWS and ticks_diff(now, self.scroll_at) > 800:
                self._list_row(row)
                self.lcd.show_rows(LIST_TOP + row * ROW_H, ROW_H)

    def _button(self, event):
        if self.screen == "run":
            if event == "enter_long":
                self.app.abort_job("cancelled")
            return
        if self.screen == "message":
            if event != "enter_long":
                self.screen = "list"
                self.reload()
                self.draw()
            return
        if self.screen == "confirm":
            if event in ("up", "down"):
                self.screen = "list"
                self.draw()
            elif event == "enter":
                try:
                    reply = self.app.start_job(self.files[self.index][0])
                except Exception as error:
                    reply = "error:" + str(error)
                if reply.startswith("error"):
                    self.message = reply
                    self.screen = "message"
                    self.draw()
            return
        # list
        if event == "up" and self.files:
            self.index = (self.index - 1) % len(self.files)
            self._sync_selection()
            self.draw()
        elif event == "down" and self.files:
            self.index = (self.index + 1) % len(self.files)
            self._sync_selection()
            self.draw()
        elif event == "enter":
            if self.error or not self.files:
                self.reload()
                self.draw()
            elif self.app.job is None and not self.app.controller.motion.busy():
                self.screen = "confirm"
                self.draw()
