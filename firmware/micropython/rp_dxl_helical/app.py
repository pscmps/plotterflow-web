"""Main-loop glue: USB bytes -> lines, SD job runner, motion ticks.

Kept free of machine-specific imports so the whole loop runs in host tests.
"""

STOP_BYTE = 0x85
CANCEL_UPLOAD_BYTE = 0x18
MAX_LINE = 256
MAX_QUEUED_LINES = 8
ALLOWED_DURING_JOB = ("M114", "M115")
FILE_COMMANDS = ("M29", "M30", "M993")


def _starts(line, prefixes):
    text = line.strip().upper()
    for prefix in prefixes:
        if text.startswith(prefix):
            return True
    return False


class Job:
    def __init__(self, sd, name):
        self.name = name
        self.file = sd.open(name)
        self.line_no = 0
        self.pending = None
        self.finishing = False
        self.result = None  # None while running, else message

    def close(self):
        try:
            self.file.close()
        except Exception:
            pass


class App:
    def __init__(self, controller, write):
        self.controller = controller
        self.write = write  # callable(str) sends one reply (may contain newlines)
        self.buffer = bytearray()
        self.lines = []
        self.job = None
        self.last_job = None  # finished job, for the UI
        self.events = []      # UI notifications
        controller.job_starter = self.start_job
        self.selected = None

    # ----- USB input ---------------------------------------------------
    def feed_bytes(self, data):
        for value in data:
            if value == STOP_BYTE:
                self.stop("stopped by host")
            elif value == CANCEL_UPLOAD_BYTE:
                if self.controller.cancel_upload():
                    self.write("[MSG:SD upload cancelled]")
                self.lines = []
                self.buffer = bytearray()
            elif value in (10, 13):
                if self.buffer:
                    try:
                        self._push_line(bytes(self.buffer).decode())
                    except UnicodeError:
                        self.write("error:bad_encoding")
                    self.buffer = bytearray()
            elif len(self.buffer) < MAX_LINE:
                self.buffer.append(value)

    def _push_line(self, line):
        if len(self.lines) >= MAX_QUEUED_LINES:
            self.write("error:line_overflow")
            return
        self.lines.append(line)

    def stop(self, reason):
        self.controller.stop()
        self.lines = []
        if self.job is not None:
            self._end_job(reason)

    # ----- SD jobs -----------------------------------------------------
    def start_job(self, name=None):
        if self.job is not None:
            return "error:job_running"
        name = name or self.selected
        if not name:
            return "error:no_file"
        if not self.controller.backend.enabled:
            self.controller.enable()
        self.job = Job(self.controller.sd, name)
        self.events.append("job_started")
        return "[MSG:SD job {} started]\nok".format(name)

    def abort_job(self, reason="cancelled"):
        if self.job is not None:
            self.stop(reason)

    def _end_job(self, result):
        job = self.job
        self.job = None
        job.close()
        job.result = result
        self.last_job = job
        self.controller.motion.stop()
        self.controller.pen.up()
        self.controller.backend.disable()
        self.events.append("job_finished")
        self.write("[MSG:SD job {} {} at line {}]".format(job.name, result, job.line_no))

    def _job_step(self):
        job = self.job
        if job.finishing:
            if self.controller.idle():
                self._end_job("completed")
            return
        if job.pending is None:
            line = job.file.readline()
            if not line:
                job.finishing = True
                return
            job.line_no += 1
            job.pending = line
        reply = self.controller.submit(job.pending)
        if reply is None:
            return
        job.pending = None
        if "error" in reply:
            self._end_job("error " + reply.split("error", 1)[1].lstrip(":"))

    # ----- loop --------------------------------------------------------
    def step(self, now_us=None):
        if self.lines:
            line = self.lines[0]
            if self.job is not None and not _starts(line, ALLOWED_DURING_JOB):
                self.lines.pop(0)
                self.write("error:job_running")
            else:
                reply = self.controller.submit(line)
                if reply is not None:
                    self.lines.pop(0)
                    self.write(reply)
                    if _starts(line, FILE_COMMANDS):
                        self.events.append("files_changed")
        elif self.job is not None:
            self._job_step()
        return self.controller.motion.tick(now_us)
