"""Minimal ULog v1 writer for test fixtures."""

from __future__ import annotations

import struct
from pathlib import Path

HEADER_BYTES = b"\x55\x4c\x6f\x67\x01\x12\x35"
MSG_TYPE_FORMAT = ord("F")
MSG_TYPE_DATA = ord("D")
MSG_TYPE_ADD_LOGGED_MSG = ord("A")
MSG_TYPE_FLAG_BITS = ord("B")

_FIELD_TYPES: dict[str, tuple[str, str]] = {
    "timestamp": ("uint64_t", "Q"),
    "arming_state": ("uint8_t", "B"),
    "x": ("float", "f"),
    "y": ("float", "f"),
    "z": ("float", "f"),
    "lat": ("int32_t", "i"),
    "lon": ("int32_t", "i"),
    "alt": ("int32_t", "i"),
    "q[0]": ("float", "f"),
    "q[1]": ("float", "f"),
    "q[2]": ("float", "f"),
    "q[3]": ("float", "f"),
    "q0": ("float", "f"),
    "q1": ("float", "f"),
    "q2": ("float", "f"),
    "q3": ("float", "f"),
}

_TOPIC_FIELDS: dict[str, list[str]] = {
    "vehicle_status": ["timestamp", "arming_state"],
    "vehicle_local_position": ["timestamp", "x", "y", "z"],
    "vehicle_attitude": ["timestamp", "q[0]", "q[1]", "q[2]", "q[3]"],
    "vehicle_gps_position": ["timestamp", "lat", "lon", "alt"],
    "vehicle_global_position": ["timestamp", "lat", "lon", "alt"],
    "estimator_status": ["timestamp", "x"],
    "estimator_innovations": ["timestamp", "x"],
}


def _write_message(f, msg_type: int, payload: bytes) -> None:
    f.write(struct.pack("<HB", len(payload), msg_type))
    f.write(payload)


def _format_payload(topic: str, field_names: list[str]) -> bytes:
    parts = [f"{topic}:"]
    for name in field_names:
        type_name, _ = _FIELD_TYPES[name]
        parts.append(f"{type_name} {name};")
    return "".join(parts).encode("utf-8")


def _pack_record(field_names: list[str], record: dict) -> bytes:
    data = bytearray()
    for name in field_names:
        _, pack_code = _FIELD_TYPES[name]
        data.extend(struct.pack("<" + pack_code, record[name]))
    return bytes(data)


def write_min_ulog(path: Path, messages: dict) -> None:
    """Write a minimal ULog v1 file readable by pyulog.ULog."""
    path = Path(path)
    topics = list(messages.keys())

    with path.open("wb") as f:
        # 16-byte file header
        header = bytearray(HEADER_BYTES)
        header.extend(struct.pack("B", 1))  # version
        header.extend(struct.pack("<Q", 0))  # start timestamp
        f.write(header)

        # B: flag bits (must be first message)
        flag_data = bytes(8 + 8 + 3 * 8)
        _write_message(f, MSG_TYPE_FLAG_BITS, flag_data)

        # F: format definitions
        for topic in topics:
            field_names = _TOPIC_FIELDS[topic]
            _write_message(f, MSG_TYPE_FORMAT, _format_payload(topic, field_names))

        # A + D: subscriptions and data (interleaved per topic)
        for msg_id, topic in enumerate(topics):
            field_names = _TOPIC_FIELDS[topic]
            add_data = struct.pack("<BH", 0, msg_id) + topic.encode("utf-8")
            _write_message(f, MSG_TYPE_ADD_LOGGED_MSG, add_data)

            for record in messages[topic]:
                payload = struct.pack("<H", msg_id) + _pack_record(field_names, record)
                _write_message(f, MSG_TYPE_DATA, payload)
