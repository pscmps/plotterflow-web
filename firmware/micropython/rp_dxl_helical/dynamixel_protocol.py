# Copied from pscmps/dynamixel-pio-xl330-m077-t-rp2040 (feature/plotter-flow-serial-multiturn 4388a51).
"""Small, dependency-free DYNAMIXEL Protocol 2.0 packet helpers.

This module runs on both MicroPython and normal CPython so the packet logic can
be tested on a PC before connecting hardware.
"""

HEADER = b"\xff\xff\xfd\x00"
STATUS_INSTRUCTION = 0x55


class ProtocolError(Exception):
    pass


class CRCError(ProtocolError):
    pass


def update_crc(crc_accum, data):
    """Return Protocol 2.0 CRC-16 (polynomial 0x8005)."""
    crc_accum &= 0xFFFF
    for value in data:
        crc_accum ^= value << 8
        for _ in range(8):
            if crc_accum & 0x8000:
                crc_accum = ((crc_accum << 1) ^ 0x8005) & 0xFFFF
            else:
                crc_accum = (crc_accum << 1) & 0xFFFF
    return crc_accum


def _stuff_body(body):
    """Escape FF FF FD inside instruction/parameter data."""
    stuffed = bytearray()
    for value in body:
        stuffed.append(value)
        if len(stuffed) >= 3 and stuffed[-3:] == b"\xff\xff\xfd":
            stuffed.append(0xFD)
    return stuffed


def _unstuff_body(body):
    unstuffed = bytearray()
    index = 0
    while index < len(body):
        unstuffed.append(body[index])
        if (
            len(unstuffed) >= 3
            and unstuffed[-3:] == b"\xff\xff\xfd"
            and index + 1 < len(body)
            and body[index + 1] == 0xFD
        ):
            index += 1
        index += 1
    return unstuffed


def build_packet(device_id, instruction, parameters=b""):
    if not 0 <= device_id <= 0xFE:
        raise ValueError("device_id must be 0..254")
    if not 0 <= instruction <= 0xFF:
        raise ValueError("instruction must be 0..255")

    body = _stuff_body(bytes((instruction,)) + bytes(parameters))
    length = len(body) + 2  # CRC bytes are part of LENGTH.
    packet = bytearray(HEADER)
    packet.append(device_id)
    packet.append(length & 0xFF)
    packet.append((length >> 8) & 0xFF)
    packet.extend(body)
    crc = update_crc(0, packet)
    packet.append(crc & 0xFF)
    packet.append((crc >> 8) & 0xFF)
    return bytes(packet)


def packet_total_length(header_and_length):
    """Return total bytes once at least the first seven bytes are available."""
    if len(header_and_length) < 7:
        return None
    if bytes(header_and_length[:4]) != HEADER:
        raise ProtocolError("invalid packet header")
    payload_length = header_and_length[5] | (header_and_length[6] << 8)
    return 7 + payload_length


def parse_packet(packet):
    packet = bytes(packet)
    if len(packet) < 10:
        raise ProtocolError("packet is too short")
    expected_length = packet_total_length(packet)
    if len(packet) != expected_length:
        raise ProtocolError(
            "packet length mismatch: expected {}, got {}".format(
                expected_length, len(packet)
            )
        )

    received_crc = packet[-2] | (packet[-1] << 8)
    calculated_crc = update_crc(0, packet[:-2])
    if received_crc != calculated_crc:
        raise CRCError(
            "CRC mismatch: received 0x{:04X}, calculated 0x{:04X}".format(
                received_crc, calculated_crc
            )
        )

    body = _unstuff_body(packet[7:-2])
    if not body:
        raise ProtocolError("packet has no instruction")
    return {
        "id": packet[4],
        "instruction": body[0],
        "parameters": bytes(body[1:]),
        "raw": packet,
    }


def parse_status_packet(packet):
    parsed = parse_packet(packet)
    if parsed["instruction"] != STATUS_INSTRUCTION:
        raise ProtocolError(
            "expected status instruction 0x55, got 0x{:02X}".format(
                parsed["instruction"]
            )
        )
    if not parsed["parameters"]:
        raise ProtocolError("status packet has no error byte")
    parsed["error"] = parsed["parameters"][0]
    parsed["parameters"] = parsed["parameters"][1:]
    return parsed
