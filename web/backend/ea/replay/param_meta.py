from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import Path


def parse_param_meta(xml: str | Path) -> dict[str, dict]:
    xml_text = xml.read_text(encoding="utf-8") if isinstance(xml, Path) else xml
    root = ET.fromstring(xml_text)
    meta: dict[str, dict] = {}

    for param in root.iter("parameter"):
        name = param.get("name")
        if not name:
            continue

        bitmask_el = param.find("bitmask")
        if bitmask_el is not None:
            bits = []
            for bit in bitmask_el.findall("bit"):
                index = bit.get("index")
                if index is None:
                    continue
                bits.append({"index": int(index), "label": (bit.text or "").strip()})
            if bits:
                meta[name] = {"kind": "bitmask", "bits": bits}
                continue

        values_el = param.find("values")
        if values_el is not None:
            options = []
            for value in values_el.findall("value"):
                code = value.get("code")
                if code is None:
                    continue
                options.append(
                    {"value": int(float(code)), "label": (value.text or "").strip()}
                )
            if options:
                meta[name] = {"kind": "enum", "options": options}
                continue

        if param.get("boolean") == "true":
            meta[name] = {"kind": "boolean"}

    return meta


def write_param_meta_json(src: Path, dest: Path) -> dict:
    data = parse_param_meta(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write("\n")
    return data
