"""Line-oriented PlotterFlow protocol and controller."""

from gcode import parse_words, ModalState


PARAMETERS = {
    "G0": "XYZF", "G1": "XYZF", "G92": "XYZ",
    "G90": "", "G91": "", "G20": "", "G21": "",
    "M17": "", "M18": "", "M3": "S", "M5": "S",
    "M115": "", "M119": "",
}


class Controller:
    def __init__(self, planner, stepper, pen, inputs=None):
        self.modal = ModalState()
        self.planner = planner
        self.stepper = stepper
        self.pen = pen
        self.stop_requested = False
        self.inputs = inputs

    def execute(self, line):
        if line and line[0] == "\x85":
            self.stop_requested = True
            self.stepper.stop()
            return "ok"
        try:
            command, words = parse_words(line)
            if command and command not in PARAMETERS:
                return "error:unsupported"
            if command and any(axis not in PARAMETERS[command] for axis in words):
                return "error:invalid_gcode"
            # Validate before checking LIMIT: malformed input must not disable
            # outputs, and overflow must not leave partially updated positions.
            if command in ("G0", "G1"):
                target, feed = self.modal.prepare_motion(words)
                steps = self.planner.target_steps(target[0], target[1])
            elif command == "G92":
                target = self.modal.coordinates(words, absolute=True)
                steps = self.planner.target_steps(target[0], target[1])
        except (ValueError, OverflowError):
            return "error:invalid_gcode"
        if not command:
            return "ok"
        if command in ('M17', 'G0', 'G1') and self.inputs and self.inputs.blocked():
            self.stepper.set_enabled(False)
            self.stepper.stop()
            self.modal.enabled = False
            return 'error:limit_triggered'
        if command == "G0" or command == "G1":
            if not self.modal.enabled:
                return "error:motors_disabled"
            try:
                events, direction = self.planner.plan(target[0], target[1], commit=False)
            except MemoryError:
                return "error:plan_too_large"
            self.stepper.set_directions(*direction)
            self.stepper.queue(events)
            if "Z" in words:
                (self.pen.down if target[2] <= 0 else self.pen.up)()
            self.modal.x, self.modal.y, self.modal.z = target
            self.modal.feed = feed
            self.planner.x_steps, self.planner.y_steps = steps
            return "ok"
        if command == "G90":
            self.modal.absolute = True
        elif command == "G91":
            self.modal.absolute = False
        elif command == "G20":
            self.modal.mm = False
        elif command == "G21":
            self.modal.mm = True
        elif command == "G92":
            self.modal.x, self.modal.y, self.modal.z = target
            self.planner.x_steps, self.planner.y_steps = steps
        elif command == "M17":
            self.stepper.set_enabled(True)
            self.modal.enabled = True
        elif command == "M18":
            self.stepper.stop()
            self.stepper.set_enabled(False)
            self.modal.enabled = False
        elif command == "M3":
            self.pen.down()
            self.modal.pen_down = True
        elif command == "M5":
            self.pen.up()
            self.modal.pen_down = False
        elif command == "M115":
            return "PlotterFlow MicroPython RP;caps=G0,G1,G90,G91,G20,G21,G92,M17,M18,M3,M5,M119,STOP"
        elif command == 'M119':
            return 'limits ' + (self.inputs.report() if self.inputs else 'X:NC Y:NC') + '\nok'
        else:
            return "error:unsupported"
        return "ok"
