"""r2 GPIO/boot/limit host tests with fake machine APIs; not electrical validation."""
import importlib
import runpy
import sys
import types
import unittest
import contextlib
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
pio_fixture = runpy.run_path(str(ROOT / 'tools/micropython-pio-test.py'))
pio = pio_fixture['module']


class Pin:
    IN, OUT, PULL_UP = 0, 1, 2
    states, calls = {}, []
    def __init__(self, number, mode=None, pull=None, value=None):
        self.number = number
        self.init(mode, pull, value=value)
    def init(self, mode=None, pull=None, value=None):
        self.calls.append(('pin', self.number, mode, pull, value))
        if value is not None:
            self.states[self.number] = value
        else:
            self.states.setdefault(self.number, 1)
    def value(self, value=None):
        if value is not None:
            self.states[self.number] = value
        return self.states[self.number]


class PWM:
    calls = []
    def __init__(self, pin, **kwargs):
        self.calls.append(('init', pin.number, kwargs))
    def duty_u16(self, value):
        self.calls.append(('u16', value))
    def duty_ns(self, value):
        self.calls.append(('ns', value))
    def deinit(self):
        self.calls.append(('deinit',))


sys.modules['machine'] = types.SimpleNamespace(Pin=Pin, PWM=PWM)
sys.path.insert(0, str(ROOT / 'firmware/micropython/rp_stepdir'))
inputs = importlib.import_module('inputs')
pen_module = importlib.import_module('pen')
from planner import CartesianPlanner
from protocol import Controller
pio.Pin = Pin


class R2Tests(unittest.TestCase):
    def setUp(self):
        Pin.calls.clear()
        Pin.states.clear()
        PWM.calls.clear()
        self.now = 0
        inputs.ticks_ms = lambda: self.now
        inputs.ticks_diff = lambda a, b: a - b
        self.config = types.SimpleNamespace(X_LIMIT=6, Y_LIMIT=8, BUTTON_UP=None,
                                            BUTTON_DOWN=None, BUTTON_OK=None, INPUT_DEBOUNCE_MS=20)

    def test_enable_off_before_step_and_no_boot_servo_pulse(self):
        motor = pio.StepperPIO(2, 3, 4, 5, 7)
        self.assertEqual(Pin.calls[:3], [('pin',7,Pin.OUT,None,1),('pin',2,Pin.OUT,None,0),('pin',3,Pin.OUT,None,0)])
        self.assertFalse(motor.enabled)
        pen = pen_module.Pen(9)
        self.assertEqual(Pin.calls[-1], ('pin',9,Pin.OUT,None,0))
        self.assertEqual(PWM.calls, [('init',9,{'freq':50,'duty_u16':0})])
        pen.up()
        self.assertEqual(PWM.calls[-1], ('ns',1000000))
        pen.off()
        self.assertEqual(PWM.calls[-2:], [('u16',0),('deinit',)])
        self.assertEqual(Pin.states[9],0)

    def test_pullups_nc_and_debounced_release(self):
        board = inputs.BoardInputs(self.config)
        self.assertEqual(Pin.calls,[('pin',6,Pin.IN,Pin.PULL_UP,None),('pin',8,Pin.IN,Pin.PULL_UP,None)])
        self.assertFalse(board.blocked())
        Pin.states[6]=0
        self.assertTrue(board.blocked())
        self.now=2
        Pin.states[6]=1
        self.assertTrue(board.blocked())
        self.now=10
        Pin.states[6]=0
        self.assertTrue(board.blocked())
        self.now=11
        Pin.states[6]=1
        self.assertTrue(board.blocked())
        self.now=31
        self.assertFalse(board.blocked())
        self.assertEqual(board.report(),'X:OPEN Y:OPEN')

    def test_trigger_blocks_enable_and_motion_without_coordinate_change(self):
        Pin.states[6]=0
        board=inputs.BoardInputs(self.config)
        motor=pio.StepperPIO(2,3,4,5,7)
        planner=CartesianPlanner(80,80)
        control=Controller(planner,motor,pen_module.Pen(9),board)
        self.assertEqual(control.execute('M17'),'error:limit_triggered')
        self.assertEqual(Pin.states[7],1)
        self.assertIn('X:TRIGGERED',control.execute('M119'))
        Pin.states[6]=1
        control.execute('M119')
        self.now=20
        self.assertEqual(control.execute('M17'),'ok')
        self.assertEqual(control.execute('G1 X1'),'ok')
        Pin.states[8]=0
        self.assertEqual(control.execute('G1 X2'),'error:limit_triggered')
        self.assertEqual(control.modal.x,1)
        self.assertEqual(planner.x_steps,80)
        self.assertFalse(control.modal.enabled)
        self.assertEqual(Pin.states[7],1)

    def test_standalone_none_does_not_allocate_input_pins(self):
        board=inputs.BoardInputs(types.SimpleNamespace())
        self.assertEqual(Pin.calls,[])
        self.assertFalse(board.blocked())
        self.assertEqual(board.report(),'X:NC Y:NC')

    def test_m119_ack_and_no_homing_claim(self):
        control=Controller(CartesianPlanner(80,80),pio.StepperPIO(2,3,4,5,7),pen_module.Pen(9),inputs.BoardInputs(self.config))
        self.assertTrue(control.execute('M119').endswith('\nok'))
        self.assertEqual(control.execute('G28'),'error:unsupported')

    def test_ctrl_c_file_update_leaves_outputs_off(self):
        class InterruptedInput:
            def readline(self):
                raise KeyboardInterrupt()
        original=sys.stdin
        try:
            sys.stdin=InterruptedInput()
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(KeyboardInterrupt):
                runpy.run_path(str(ROOT / 'firmware/micropython/rp_stepdir/main.py'))
        finally:
            sys.stdin=original
        self.assertEqual(Pin.states[7],1)
        self.assertEqual(Pin.states[12],0)
        self.assertIn(('deinit',),PWM.calls)


if __name__ == '__main__':
    unittest.main()
