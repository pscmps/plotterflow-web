"""G-code acceptance and rejection tests using output-recording fakes only."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "firmware/micropython/rp_stepdir"))

from gcode import ModalState, parse_words
from planner import CartesianPlanner, line_events
from protocol import Controller


class Stepper:
    def __init__(self):
        self.calls = []

    def set_enabled(self, value):
        self.calls.append(("enable", value))

    def set_directions(self, *value):
        self.calls.append(("direction", value))

    def queue(self, events):
        self.calls.append(("queue", list(events)))

    def stop(self):
        self.calls.append(("stop",))


class Pen:
    def __init__(self):
        self.calls = []

    def up(self):
        self.calls.append("up")

    def down(self):
        self.calls.append("down")


class Inputs:
    def __init__(self):
        self.triggered = False
        self.checks = 0

    def blocked(self):
        self.checks += 1
        return self.triggered

    def report(self):
        return "X:OPEN Y:OPEN"


class GCodeTest(unittest.TestCase):
    def setUp(self):
        self.stepper, self.pen, self.inputs = Stepper(), Pen(), Inputs()
        self.planner = CartesianPlanner(10, 20)
        self.control = Controller(self.planner, self.stepper, self.pen, self.inputs)
        self.assertEqual(self.control.execute("M17"), "ok")
        self.assertEqual(self.control.execute("G92 X1 Y2 Z3"), "ok")

    def snapshot(self):
        return (vars(self.control.modal).copy(), vars(self.planner).copy(),
                list(self.stepper.calls), list(self.pen.calls), self.inputs.checks,
                self.control.stop_requested)

    def reject_unchanged(self, line, reply="error:invalid_gcode"):
        before = self.snapshot()
        self.assertEqual(self.control.execute(line), reply, line)
        self.assertEqual(self.snapshot(), before, line)

    def test_invalid_syntax_never_reaches_outputs_or_limit_check(self):
        invalid = (
            "G0.1 X1", "G1.0 X1", "G1 Xgarbage", "G1X1M18", "G90 G1 X2",
            "G1 X1 X2", "G1 F100 F200", "G1 X", "G1 X+", "G1 X.",
            "G1 X1e", "G1 X1e+", "G1 X1.2.3", "G1 X1junk", "G1 X1!",
            "G1 Xnan", "G1 Xinf", "G1 X1e309", "G92 X1 Y-1e309",
            "M17 X1", "M18 X1", "M3 S1e309", "M5 X0", "G20 X1",
            "G1 Q1", "G92 F200", "G1 X1 (unfinished", "G1 X1 )",
            "G1 X1 ((nested))", "G1 X1(comment)2", "G1 X1\nY2",
            "X2", "F300", "N1 G1 X2", "%", "garbage", "G", "G+1 X2",
        )
        for triggered in (False, True):
            self.inputs.triggered = triggered
            for line in invalid:
                with self.subTest(line=line, limit=triggered):
                    self.reject_unchanged(line)

    def test_rejected_input_does_not_disable_or_poison_next_move(self):
        self.reject_unchanged("G1 X1e309")
        self.assertEqual(self.control.execute("G1 X2"), "ok")
        self.assertEqual(self.control.modal.x, 2)
        self.assertEqual(self.planner.x_steps, 20)
        self.assertTrue(self.control.modal.enabled)

    def test_blank_and_comments_are_noops(self):
        for line in ("", " \t\r\n", "; G1 X999", "(G1 X999)", "(a) (b); c"):
            before = self.snapshot()
            self.assertEqual(self.control.execute(line), "ok")
            self.assertEqual(self.snapshot(), before)

    def test_decimal_exponent_case_spacing_and_comments(self):
        line = " (prefix) g01 x +.5 (x) y-2. z1e-1 f3E+2 ; M18"
        self.assertEqual(parse_words(line), ("G1", {"X": .5, "Y": -2., "Z": .1, "F": 300.}))
        self.assertEqual(self.control.execute(line), "ok")
        self.assertEqual((self.control.modal.x, self.control.modal.y, self.control.modal.z), (.5, -2., .1))
        self.assertEqual(self.control.modal.feed, 300.)
        self.assertEqual((self.planner.x_steps, self.planner.y_steps), (5, -40))
        self.assertEqual(self.pen.calls, ["up"])

    def test_web_initialization_and_drawing_sequence(self):
        self.assertEqual(self.control.execute("M18"), "ok")
        for line in ("M17", "G21", "G90", "G92 X0 Y0", "M5", "G0 X1 Y1 F600",
                     "M3", "G1 X2 Y1 F300", "M5", "M18"):
            self.assertEqual(self.control.execute(line), "ok", line)
        self.assertEqual((self.control.modal.x, self.control.modal.y), (2, 1))
        self.assertEqual((self.planner.x_steps, self.planner.y_steps), (20, 20))
        self.assertEqual(self.pen.calls, ["up", "down", "up"])
        self.assertFalse(self.control.modal.enabled)

    def test_inches_g92_is_absolute_even_in_relative_mode(self):
        for line in ("G20", "G91", "G92 X1 Y-.5 Z.25"):
            self.assertEqual(self.control.execute(line), "ok")
        self.assertEqual((self.control.modal.x, self.control.modal.y, self.control.modal.z), (25.4, -12.7, 6.35))
        self.assertEqual((self.planner.x_steps, self.planner.y_steps), (254, -254))
        self.assertEqual(self.control.execute("G1 X.5 F2"), "ok")
        self.assertAlmostEqual(self.control.modal.x, 38.1)
        self.assertEqual(self.control.modal.y, -12.7)
        self.assertEqual(self.control.modal.feed, 50.8)

    def test_g92_partial_axes_and_switch_back_to_mm(self):
        self.control.execute("G20")
        self.control.execute("G92 X1")
        self.assertEqual((self.control.modal.x, self.control.modal.y, self.control.modal.z), (25.4, 2, 3))
        self.control.execute("G21")
        self.control.execute("G91")
        self.control.execute("G92 Y4")
        self.assertEqual((self.control.modal.x, self.control.modal.y, self.control.modal.z), (25.4, 4, 3))
        self.control.execute("G1 X1")
        self.assertAlmostEqual(self.control.modal.x, 26.4)
        self.control.execute("G90")
        self.control.execute("G0 X2")
        self.assertEqual((self.control.modal.x, self.planner.x_steps), (2, 20))

    def test_g92_no_axes_does_not_move_or_reset_unspecified_axes(self):
        before = self.snapshot()
        self.assertEqual(self.control.execute("G92"), "ok")
        self.assertEqual(self.snapshot(), before)

    def test_unit_and_feed_overflow_are_rejected_before_limit_handling(self):
        self.control.execute("G20")
        self.inputs.triggered = True
        for line in ("G1 X1e308", "G1 Z1e308", "G1 F1e308", "G92 X1 Y1e308"):
            self.reject_unchanged(line)

    def test_relative_sum_and_step_scaling_overflow(self):
        self.control.execute("G91")
        self.control.modal.z = 1e308
        self.reject_unchanged("G1 Z1e308")
        self.control.modal.z = 3
        for line in ("G1 X1e308", "G92 X2 Y1e308"):
            self.reject_unchanged(line)

    def test_planning_allocation_failure_keeps_state_and_outputs(self):
        before = self.snapshot()
        with patch("planner.line_events", side_effect=MemoryError):
            self.assertEqual(self.control.execute("G1 X2 F100"), "error:plan_too_large")
        after = self.snapshot()
        self.assertEqual(after[:4], before[:4])
        self.assertEqual(after[4], before[4] + 1)  # Valid command checked LIMIT.
        self.assertEqual(after[5], before[5])

    def test_finite_feed_clamp_and_modal_feed_are_preserved(self):
        self.control.execute("G1 F0")
        self.assertEqual(self.control.modal.feed, 1)
        self.control.execute("G20")
        self.control.execute("G1 F2")
        self.control.execute("G1")
        self.assertEqual(self.control.modal.feed, 50.8)

    def test_existing_valid_limit_interlock_still_disables(self):
        self.inputs.triggered = True
        coordinates = (self.control.modal.x, self.planner.x_steps)
        self.assertEqual(self.control.execute("G1 X2"), "error:limit_triggered")
        self.assertEqual((self.control.modal.x, self.planner.x_steps), coordinates)
        self.assertFalse(self.control.modal.enabled)
        self.assertEqual(self.stepper.calls[-2:], [("enable", False), ("stop",)])

    def test_existing_disabled_motion_and_status_commands(self):
        self.control.execute("M18")
        self.assertEqual(self.control.execute("G1 X2"), "error:motors_disabled")
        self.assertEqual(self.control.modal.x, 1)
        self.assertTrue(self.control.execute("M115").startswith("PlotterFlow MicroPython RP;caps="))
        self.assertEqual(self.control.execute("M119"), "limits X:OPEN Y:OPEN\nok")
        self.reject_unchanged("G28", "error:unsupported")
        self.reject_unchanged("G2 X1 Y2 I1", "error:unsupported")

    def test_pen_optional_s_compatibility_z_and_stop(self):
        for line in ("M3 S1000", "M5 S0", "G1 Z0", "G0 Z1"):
            self.assertEqual(self.control.execute(line), "ok")
        self.assertEqual(self.pen.calls, ["down", "up", "down", "up"])
        self.assertEqual(self.control.execute("\x85"), "ok")
        self.assertTrue(self.control.stop_requested)
        self.assertEqual(self.stepper.calls[-1], ("stop",))

    def test_modal_and_planner_host_api_compatibility(self):
        modal = ModalState()
        modal.motion({"X": 10, "Y": 5})
        modal.absolute = False
        self.assertEqual(modal.motion({"X": 2})[:2], (12, 5))
        self.assertEqual(len(line_events(0, 0, 3, 2)), 3)
        planner = CartesianPlanner(10, 20)
        planner.plan(1, 2)
        self.assertEqual((planner.x_steps, planner.y_steps), (10, 40))
        planner.zero(3, 4)
        with self.assertRaises(ValueError):
            planner.zero(5, float("inf"))
        self.assertEqual((planner.x_steps, planner.y_steps), (30, 80))


if __name__ == "__main__":
    unittest.main()
