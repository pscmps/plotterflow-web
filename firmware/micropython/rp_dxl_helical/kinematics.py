"""Helical differential kinematics.

B carries the gantry nut, so X follows B directly. A meshes with the cross
shaft C. Moving the gantry along A while A stands still rolls C along A's
helix and drags the carriage, so A must also turn by the X travel to hold Y:

    B_rev = X / L
    A_rev = (Y + COUPLING * X) / L
"""


class HelicalDiffKinematics:
    def __init__(self, lead_mm, pulses_per_rev=4096, a_dir=1, b_dir=1, coupling=1):
        if lead_mm <= 0:
            raise ValueError("lead must be positive")
        self.lead = float(lead_mm)
        self.ppr = pulses_per_rev
        self.a_dir = 1 if a_dir >= 0 else -1
        self.b_dir = 1 if b_dir >= 0 else -1
        self.coupling = 1 if coupling >= 0 else -1

    def revs(self, x, y):
        """Shaft revolutions (A, B) from machine XY in mm."""
        return (y + self.coupling * x) / self.lead, x / self.lead

    def to_pulses(self, x, y):
        """Pulse offsets (A, B) from the origin, direction applied."""
        a, b = self.revs(x, y)
        return (
            int(round(a * self.ppr * self.a_dir)),
            int(round(b * self.ppr * self.b_dir)),
        )

    def to_xy(self, a_pulses, b_pulses):
        a = a_pulses * self.a_dir / self.ppr
        b = b_pulses * self.b_dir / self.ppr
        x = b * self.lead
        return x, a * self.lead - self.coupling * x

    def rev_per_mm(self, ux, uy):
        """|dA/ds|, |dB/ds| in rev/mm for a unit direction (ux, uy)."""
        return abs(uy + self.coupling * ux) / self.lead, abs(ux) / self.lead
