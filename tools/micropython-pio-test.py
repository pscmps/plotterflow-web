"""Host-side PIO instruction model, not electrical/hardware validation."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path


class Instruction:
    def __init__(self, op, *args):
        self.op, self.args, self.side_value, self.delay = op, args, None, 0

    def side(self, value):
        self.side_value = value
        return self

    def __getitem__(self, delay):
        self.delay = delay
        return self


def assemble(**options):
    def decorator(function):
        program = []
        def emit(op):
            def call(*args):
                item = Instruction(op, *args)
                program.append(item)
                return item
            return call
        for op in ("pull", "out", "jmp", "mov", "label", "nop"):
            function.__globals__[op] = emit(op)
        for symbol in ("block", "pins", "x", "y", "null", "not_y"):
            function.__globals__[symbol] = symbol
        function()
        return program
    return decorator


class Pin:
    OUT = 1
    def __init__(self, number, mode=None, value=0):
        self.number, self.current = number, value
    def value(self, value):
        self.current = value


class StateMachine:
    def __init__(self, number, program, **config):
        self.config, self.program, self.queued = config, program, []
    def active(self, active):
        self.running = active
    def put(self, mask):
        self.queued.append(mask)
    def restart(self):
        pass


sys.modules["rp2"] = types.SimpleNamespace(asm_pio=assemble, StateMachine=StateMachine,
    PIO=types.SimpleNamespace(OUT_LOW=0, SHIFT_RIGHT=1))
sys.modules["machine"] = types.SimpleNamespace(Pin=Pin)
path = Path(__file__).resolve().parents[1] / "firmware/micropython/rp_stepdir/pio_stepper.py"
spec = importlib.util.spec_from_file_location("pio_stepper_test", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def trace(program, mask):
    labels = {item.args[0]: i for i, item in enumerate(program) if item.op == "label"}
    registers = {"x": 0, "y": 0, "null": 0}
    pc, cycle, x_pin, y_pin = 0, 0, 0, 0
    changes = []
    while pc < len(program):
        item = program[pc]
        pc += 1
        if item.op == "label":
            continue
        before = (x_pin, y_pin)
        if item.op == "out":
            dest, count = item.args
            registers[dest], mask = mask & ((1 << count) - 1), mask >> count
        elif item.op == "mov":
            assert item.args[0] == "pins"
            x_pin = registers[item.args[1]]
        elif item.op == "jmp":
            if len(item.args) == 1 or registers["y"] == 0:
                pc = labels[item.args[-1]]
        if item.side_value is not None:
            y_pin = item.side_value
        if (x_pin, y_pin) != before:
            changes.append((cycle, x_pin, y_pin))
        cycle += 1 + item.delay
    return changes


class PioTests(unittest.TestCase):
    def test_all_masks_and_simultaneous_edges(self):
        self.assertEqual(trace(module._step_program, 0), [])
        for mask in (1, 2, 3):
            self.assertEqual(trace(module._step_program, mask),
                             [(4, mask & 1, mask >> 1), (10, 0, 0)])

    def test_non_adjacent_pins_and_enable_polarity(self):
        for active_low in (False, True):
            motor = module.StepperPIO(17, 22, 18, 23, 14, active_low)
            self.assertEqual(motor.sm.config["out_base"].number, 17)
            self.assertEqual(motor.sm.config["sideset_base"].number, 22)
            self.assertNotIn("set_base", motor.sm.config)
            self.assertEqual(motor.enable_pin.current, int(active_low))
            with self.assertRaises(RuntimeError):
                motor.queue([(3, 0)])
            motor.set_enabled(True)
            self.assertEqual(motor.enable_pin.current, int(not active_low))
            motor.queue([(1, 0), (2, 0), (3, 0)])
            self.assertEqual(motor.sm.queued, [1, 2, 3])
            motor.set_enabled(False)
            self.assertEqual(motor.enable_pin.current, int(active_low))

    def test_duplicates_rejected(self):
        with self.assertRaises(ValueError):
            module.StepperPIO(2, 2, 4, 5, 7)


if __name__ == "__main__":
    unittest.main()
