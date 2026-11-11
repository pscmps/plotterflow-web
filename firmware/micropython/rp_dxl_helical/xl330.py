"""Minimal XL330-M077-T access over DYNAMIXEL Protocol 2.0.

Based on pscmps/dynamixel-pio-xl330-m077-t-rp2040 (xl330.py), trimmed to what
the plotter needs and extended with a combined velocity + goal Sync Write.
"""

from dynamixel_protocol import build_packet, parse_status_packet

INST_PING = 0x01
INST_READ = 0x02
INST_WRITE = 0x03
INST_SYNC_WRITE = 0x83
BROADCAST_ID = 0xFE

ADDR_DRIVE_MODE = 10
ADDR_OPERATING_MODE = 11
ADDR_VELOCITY_LIMIT = 44
ADDR_TORQUE_ENABLE = 64
ADDR_HARDWARE_ERROR = 70
ADDR_PROFILE_ACCELERATION = 108
ADDR_PROFILE_VELOCITY = 112
ADDR_GOAL_POSITION = 116
ADDR_PRESENT_POSITION = 132

MODEL_XL330_M077_T = 1190
MODE_EXTENDED_POSITION = 4
POSITION_LIMIT = 1_048_575
VELOCITY_UNIT_RPM = 0.229
DRIVE_MODE_TIME_BASED = 0x04


class DynamixelStatusError(Exception):
    def __init__(self, device_id, error):
        super().__init__("DYNAMIXEL ID {} error 0x{:02X}".format(device_id, error))
        self.device_id = device_id
        self.error = error


def le16(value):
    return bytes((value & 0xFF, (value >> 8) & 0xFF))


def le32(value):
    value &= 0xFFFFFFFF
    return bytes((value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF))


def from_le(data, signed=False):
    value = 0
    for index, byte in enumerate(data):
        value |= byte << (8 * index)
    if signed and value & (1 << (len(data) * 8 - 1)):
        value -= 1 << (len(data) * 8)
    return value


def motion_sync_packet(items):
    """Sync Write Profile Velocity (112) + Goal Position (116) for each ID.

    items: iterable of (device_id, velocity_raw, goal_position).
    """
    params = bytearray(le16(ADDR_PROFILE_VELOCITY) + le16(8))
    count = 0
    for device_id, velocity, goal in items:
        if not 0 <= device_id <= 0xFC:
            raise ValueError("bad ID")
        if not 0 <= velocity <= 32767:
            raise ValueError("velocity out of range")
        if not -POSITION_LIMIT <= goal <= POSITION_LIMIT:
            raise ValueError("goal outside extended range")
        params.append(device_id)
        params.extend(le32(velocity))
        params.extend(le32(goal))
        count += 1
    if not count:
        raise ValueError("no devices")
    return build_packet(BROADCAST_ID, INST_SYNC_WRITE, params)


class XL330Bus:
    def __init__(self, transport):
        self.transport = transport

    def _request(self, device_id, instruction, parameters=b""):
        response = self.transport.exchange(build_packet(device_id, instruction, parameters))
        status = parse_status_packet(response)
        if status["id"] != device_id:
            raise OSError("reply from ID {} instead of {}".format(status["id"], device_id))
        if status["error"]:
            raise DynamixelStatusError(device_id, status["error"])
        return status["parameters"]

    def ping(self, device_id):
        params = self._request(device_id, INST_PING)
        if len(params) < 3:
            raise OSError("short Ping reply")
        return from_le(params[:2])

    def read(self, device_id, address, size):
        value = self._request(device_id, INST_READ, le16(address) + le16(size))
        if len(value) != size:
            raise OSError("read size mismatch")
        return value

    def write(self, device_id, address, data):
        self._request(device_id, INST_WRITE, le16(address) + bytes(data))

    def torque(self, device_id, enabled):
        self.write(device_id, ADDR_TORQUE_ENABLE, bytes((1 if enabled else 0,)))

    def operating_mode(self, device_id):
        return self.read(device_id, ADDR_OPERATING_MODE, 1)[0]

    def set_operating_mode(self, device_id, mode):
        self.write(device_id, ADDR_OPERATING_MODE, bytes((mode,)))

    def drive_mode(self, device_id):
        return self.read(device_id, ADDR_DRIVE_MODE, 1)[0]

    def velocity_limit(self, device_id):
        return from_le(self.read(device_id, ADDR_VELOCITY_LIMIT, 4))

    def hardware_error(self, device_id):
        return self.read(device_id, ADDR_HARDWARE_ERROR, 1)[0]

    def set_profile_acceleration(self, device_id, raw):
        self.write(device_id, ADDR_PROFILE_ACCELERATION, le32(raw))

    def set_profile_velocity(self, device_id, raw):
        self.write(device_id, ADDR_PROFILE_VELOCITY, le32(raw))

    def set_goal(self, device_id, position):
        self.write(device_id, ADDR_GOAL_POSITION, le32(position))

    def present_position(self, device_id):
        return from_le(self.read(device_id, ADDR_PRESENT_POSITION, 4), signed=True)

    def sync_motion(self, items):
        self.transport.write(motion_sync_packet(items))
