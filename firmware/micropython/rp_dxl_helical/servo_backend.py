"""XL330 A/B servo pair: enable checks, power-on origin and slice output."""

from xl330 import MODE_EXTENDED_POSITION, MODEL_XL330_M077_T, DRIVE_MODE_TIME_BASED, VELOCITY_UNIT_RPM


class ServoError(Exception):
    pass


class XL330PairBackend:
    def __init__(self, bus, a_id, b_id, max_rpm=90.0, auto_extended=True):
        self.bus = bus
        self.ids = (a_id, b_id)
        self.max_rpm = float(max_rpm)
        self.auto_extended = auto_extended
        self.origin = None  # present positions captured at the first enable
        self.enabled = False
        self.limit_rpm = None

    def _check(self, device_id):
        try:
            model = self.bus.ping(device_id)
        except Exception as error:
            raise ServoError("ID{} no reply ({})".format(device_id, error))
        if model != MODEL_XL330_M077_T:
            raise ServoError("ID{} model {} is not XL330-M077-T".format(device_id, model))
        if self.bus.drive_mode(device_id) & DRIVE_MODE_TIME_BASED:
            raise ServoError("ID{} uses time-based profile; set Drive Mode bit2=0".format(device_id))
        if self.bus.operating_mode(device_id) != MODE_EXTENDED_POSITION:
            if not self.auto_extended:
                raise ServoError("ID{} is not in Extended Position Mode".format(device_id))
            self.bus.torque(device_id, False)
            self.bus.set_operating_mode(device_id, MODE_EXTENDED_POSITION)
            if self.bus.operating_mode(device_id) != MODE_EXTENDED_POSITION:
                raise ServoError("ID{} refused Extended Position Mode".format(device_id))
        return self.bus.velocity_limit(device_id) * VELOCITY_UNIT_RPM

    def enable(self):
        """Check both servos, capture the origin once, hold position, torque on.
        Returns the present (a, b) pulse offsets from the origin."""
        limits = [self._check(i) for i in self.ids]
        self.limit_rpm = min(limits) if all(limits) else None
        present = [self.bus.present_position(i) for i in self.ids]
        if self.origin is None:
            self.origin = tuple(present)
        for device_id, position in zip(self.ids, present):
            self.bus.set_profile_acceleration(device_id, 0)
            self.bus.set_profile_velocity(device_id, 1)
            self.bus.set_goal(device_id, position)
            self.bus.torque(device_id, True)
        self.enabled = True
        return present[0] - self.origin[0], present[1] - self.origin[1]

    def max_rev_s(self):
        rpm = self.max_rpm
        if self.limit_rpm:
            rpm = min(rpm, self.limit_rpm)
        return rpm / 60.0

    def move(self, a, b, va, vb):
        if not self.enabled:
            raise ServoError("torque is off")
        self.bus.sync_motion(((self.ids[0], va, self.origin[0] + a), (self.ids[1], vb, self.origin[1] + b)))

    def present(self):
        return tuple(self.bus.present_position(i) - o for i, o in zip(self.ids, self.origin))

    def disable(self):
        self.enabled = False
        for device_id in self.ids:
            try:
                self.bus.torque(device_id, False)
            except Exception:
                pass
