"""Look-ahead line planner and time-sliced executor for two position servos.

Every SLICE_MS the executor advances along the queued XY path with a
trapezoidal speed profile and sends one Sync Write that carries, for both
servos, the goal position and the profile velocity needed to reach it in
about one slice. Corners use junction deviation; the profile always keeps
enough distance to stop at the end of what is queued, so later lines can
only make it faster, never unsafe.
"""

import math

from clock import ticks_add, ticks_diff, ticks_us

MIN_SPEED = 0.5  # mm/s, keeps the final approach from stalling.


class Segment:
    def __init__(self, x0, y0, x1, y1, vmax):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        dx, dy = x1 - x0, y1 - y0
        self.length = math.sqrt(dx * dx + dy * dy)
        self.ux, self.uy = dx / self.length, dy / self.length
        self.vmax = vmax
        self.vjunction = 0.0  # max speed when entering this segment


class Motion:
    def __init__(self, kinematics, backend, accel=800.0, junction_deviation=0.05,
                 slice_ms=30, velocity_margin=1.15, queue_size=32,
                 velocity_unit_rpm=0.229, clock=ticks_us):
        self.kin = kinematics
        self.backend = backend
        self.accel = float(accel)
        self.junction_deviation = float(junction_deviation)
        self.slice_us = int(slice_ms * 1000)
        self.margin = velocity_margin
        self.queue_size = queue_size
        self.velocity_unit_rpm = velocity_unit_rpm
        self.clock = clock
        self.max_motor_rev_s = 1.0
        self.queue = []
        self.exit_speed = []
        self.s = 0.0
        self.v = 0.0
        self.x = self.y = 0.0          # executed (commanded) machine position
        self.tail_x = self.tail_y = 0.0  # end of the queued path
        self.last_pulses = None
        self.next_slice = None
        self.slices_sent = 0

    # ----- state -------------------------------------------------------
    def set_position(self, x, y):
        if self.queue:
            raise RuntimeError("cannot set position while moving")
        self.x = self.tail_x = x
        self.y = self.tail_y = y
        self.v = 0.0
        self.last_pulses = self.kin.to_pulses(x, y)

    def busy(self):
        return bool(self.queue)

    def full(self):
        return len(self.queue) >= self.queue_size

    def stop(self):
        """Drop everything queued. The last goal already sent is at most one
        slice ahead, so the servos settle there."""
        self.queue = []
        self.exit_speed = []
        self.s = 0.0
        self.v = 0.0
        self.tail_x, self.tail_y = self.x, self.y
        self.next_slice = None

    # ----- planning ----------------------------------------------------
    def motor_speed_limit(self, ux, uy):
        ra, rb = self.kin.rev_per_mm(ux, uy)
        rate = max(ra, rb)
        return self.max_motor_rev_s / rate if rate > 0 else 1e9

    def _junction_speed(self, prev, seg):
        cos_theta = -(prev.ux * seg.ux + prev.uy * seg.uy)
        if cos_theta < -0.9999:
            return 1e9  # straight on
        if cos_theta > 0.9999:
            return 0.0  # full reversal
        sin_half = math.sqrt(0.5 * (1.0 - cos_theta))
        return math.sqrt(self.accel * self.junction_deviation * sin_half / (1.0 - sin_half))

    def enqueue(self, x, y, speed):
        """Queue a straight move to machine (x, y) at speed mm/s.
        Returns False when the queue is full (caller retries later)."""
        if self.full():
            return False
        dx, dy = x - self.tail_x, y - self.tail_y
        if dx * dx + dy * dy < 1e-8:
            return True
        seg = Segment(self.tail_x, self.tail_y, x, y, 0.0)
        seg.vmax = max(MIN_SPEED, min(speed, self.motor_speed_limit(seg.ux, seg.uy)))
        if self.queue:
            seg.vjunction = self._junction_speed(self.queue[-1], seg)
        self.queue.append(seg)
        self.tail_x, self.tail_y = x, y
        self._replan()
        return True

    def _replan(self):
        n = len(self.queue)
        exits = [0.0] * n
        for i in range(n - 2, -1, -1):
            nxt = self.queue[i + 1]
            reach = math.sqrt(exits[i + 1] ** 2 + 2.0 * self.accel * nxt.length)
            exits[i] = min(nxt.vjunction, self.queue[i].vmax, nxt.vmax, reach)
        self.exit_speed = exits

    # ----- execution ---------------------------------------------------
    def tick(self, now=None):
        """Call often. Sends at most one slice. Returns True when it sent."""
        if not self.queue:
            self.next_slice = None
            return False
        if now is None:
            now = self.clock()
        if self.next_slice is None:
            self.next_slice = now
        late = ticks_diff(now, self.next_slice)
        if late < 0:
            return False
        dt_us = self.slice_us
        if late > self.slice_us:  # we fell behind (USB, LCD, GC): catch up a bit
            dt_us = min(2 * self.slice_us, self.slice_us + late)
            self.next_slice = now
        self.next_slice = ticks_add(self.next_slice, self.slice_us)
        dt = dt_us / 1_000_000
        self._advance(dt)
        self._send(dt)
        return True

    def _advance(self, dt):
        seg = self.queue[0]
        remaining = seg.length - self.s
        allowed = min(seg.vmax, math.sqrt(self.exit_speed[0] ** 2 + 2.0 * self.accel * remaining))
        v_new = min(self.v + self.accel * dt, allowed)
        v_new = max(v_new, MIN_SPEED)
        d = 0.5 * (self.v + v_new) * dt
        self.v = v_new
        while d > 0 and self.queue:
            seg = self.queue[0]
            remaining = seg.length - self.s
            if d < remaining:
                self.s += d
                d = 0.0
            else:
                d -= remaining
                self.queue.pop(0)
                self.exit_speed.pop(0)
                self.s = 0.0
                if self.queue:
                    # Do not carry more than the next junction allows.
                    self.v = min(self.v, self.queue[0].vjunction, self.queue[0].vmax)
                    d = min(d, self.v * dt)
        if self.queue:
            seg = self.queue[0]
            self.x = seg.x0 + seg.ux * self.s
            self.y = seg.y0 + seg.uy * self.s
        else:
            self.x, self.y = self.tail_x, self.tail_y
            self.v = 0.0

    def velocity_raw(self, delta_pulses, dt):
        if delta_pulses == 0:
            return 1  # 0 would mean "unlimited" to the servo
        rev_s = abs(delta_pulses) / self.kin.ppr / dt
        raw = int(math.ceil(rev_s * 60.0 / self.velocity_unit_rpm * self.margin))
        return max(1, min(32767, raw))

    def _send(self, dt):
        a, b = self.kin.to_pulses(self.x, self.y)
        if self.last_pulses is None:
            self.last_pulses = (a, b)
        la, lb = self.last_pulses
        self.backend.move(a, b, self.velocity_raw(a - la, dt), self.velocity_raw(b - lb, dt))
        self.last_pulses = (a, b)
        self.slices_sent += 1
