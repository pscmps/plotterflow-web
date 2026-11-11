# Copied from pscmps/dynamixel-pio-xl330-m077-t-rp2040 (feature/plotter-flow-serial-multiturn 4388a51).
"""One-wire 8N1 UART transport using two RP2-series PIO state machines."""

from machine import Pin
import rp2
import time

from dynamixel_protocol import HEADER, packet_total_length


@rp2.asm_pio(
    sideset_init=rp2.PIO.IN_HIGH,
    out_init=rp2.PIO.IN_HIGH,
    set_init=rp2.PIO.IN_HIGH,
    out_shiftdir=rp2.PIO.SHIFT_RIGHT,
)
def _uart_tx_halfduplex():
    # Stay Hi-Z while waiting. One FIFO word contains one byte in its low bits.
    pull()
    set(pindirs, 1)

    # Start bit and eight data bits, eight PIO cycles per UART bit.
    set(x, 7).side(0)[7]
    label("tx_bits")
    out(pins, 1)[6]
    jmp(x_dec, "tx_bits")

    # Stop bit. The final cycle is Hi-Z and the XL330 bus holds idle high.
    nop().side(1)[6]
    set(pindirs, 0)


@rp2.asm_pio(
    in_shiftdir=rp2.PIO.SHIFT_RIGHT,
    autopush=True,
    push_thresh=8,
    fifo_join=rp2.PIO.JOIN_RX,
)
def _uart_rx():
    # Raspberry Pi's uart_rx_mini timing: sample in the centre of each bit.
    wait(0, pin, 0)
    set(x, 7)[10]
    label("rx_bits")
    in_(pins, 1)
    jmp(x_dec, "rx_bits")[6]


class PIOHalfDuplexUART:
    """PIO UART for an XL330 3.3 V TTL multidrop DATA line.

    The receive state machine is paused during transmit so it cannot fill its
    FIFO with local echo. The default XL330 Return Delay Time of 500 us leaves
    enough time to enable RX after the last stop bit at 57,600 baud.
    """

    def __init__(
        self,
        data_pin=2,
        baudrate=57600,
        tx_sm_id=0,
        rx_sm_id=1,
        timeout_ms=100,
    ):
        if baudrate <= 0:
            raise ValueError("baudrate must be positive")
        if tx_sm_id == rx_sm_id:
            raise ValueError("TX and RX state machine IDs must differ")

        self.baudrate = baudrate
        self.timeout_ms = timeout_ms
        self.pin = Pin(data_pin, Pin.IN, Pin.PULL_UP)

        pio_frequency = 8 * baudrate
        self.tx_sm = rp2.StateMachine(
            tx_sm_id,
            _uart_tx_halfduplex,
            freq=pio_frequency,
            sideset_base=self.pin,
            out_base=self.pin,
            set_base=self.pin,
        )
        self.rx_sm = rp2.StateMachine(
            rx_sm_id,
            _uart_rx,
            freq=pio_frequency,
            in_base=self.pin,
        )

        self.tx_sm.exec("set(pindirs, 0)")
        self.tx_sm.active(1)
        self.rx_sm.active(1)

    def _drain_rx(self):
        while self.rx_sm.rx_fifo():
            self.rx_sm.get()

    def _prepare_rx(self):
        self.rx_sm.active(0)
        self._drain_rx()
        self.rx_sm.restart()

    def write(self, data):
        """Transmit bytes, return DATA to Hi-Z, then enable the RX state machine."""
        self._prepare_rx()
        for value in data:
            self.tx_sm.put(value)

        # FIFO empty means the last byte was pulled into the output shifter.
        while self.tx_sm.tx_fifo():
            pass

        # Allow that byte (start + 8 data + stop) and direction release to finish.
        final_byte_us = (11_000_000 + self.baudrate - 1) // self.baudrate
        time.sleep_us(final_byte_us)
        self.tx_sm.exec("set(pindirs, 0)")  # Fail-safe: DATA must now be Hi-Z.

        self.rx_sm.restart()
        self.rx_sm.active(1)

    @staticmethod
    def _find_header(buffer):
        limit = len(buffer) - len(HEADER) + 1
        for index in range(max(0, limit)):
            if bytes(buffer[index : index + 4]) == HEADER:
                return index
        return -1

    def read_packet(self, timeout_ms=None):
        """Read one complete Protocol 2.0 packet or raise OSError on timeout."""
        if timeout_ms is None:
            timeout_ms = self.timeout_ms
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        buffer = bytearray()

        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            while self.rx_sm.rx_fifo():
                # SHIFT_RIGHT places the received byte in bits 31..24.
                buffer.append((self.rx_sm.get() >> 24) & 0xFF)

            header_at = self._find_header(buffer)
            if header_at > 0:
                del buffer[:header_at]
            elif header_at < 0 and len(buffer) > 3:
                del buffer[:-3]

            if len(buffer) >= 7 and bytes(buffer[:4]) == HEADER:
                total = packet_total_length(buffer)
                if total > 1024:
                    raise OSError("implausible DYNAMIXEL packet length: {}".format(total))
                if len(buffer) >= total:
                    return bytes(buffer[:total])

            time.sleep_us(50)

        raise OSError("DYNAMIXEL response timeout ({} ms)".format(timeout_ms))

    def exchange(self, packet, timeout_ms=None):
        self.write(packet)
        return self.read_packet(timeout_ms)

    def close(self):
        self.rx_sm.active(0)
        self.tx_sm.exec("set(pindirs, 0)")
        self.tx_sm.active(0)
        self.pin.init(Pin.IN, Pin.PULL_UP)
