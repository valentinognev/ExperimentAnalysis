from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

DEFAULT_QGC_META = Path("/home/valentin/.config/QGroundControl/ParameterFactMetaData.json")


def _param_unit(param: ET.Element) -> str | None:
    el = param.find("unit")
    if el is None:
        return None
    text = (el.text or "").strip()
    return text or None


def parse_param_meta(xml: str | Path) -> dict[str, dict]:
    xml_text = xml.read_text(encoding="utf-8") if isinstance(xml, Path) else xml
    root = ET.fromstring(xml_text)
    meta: dict[str, dict] = {}

    for param in root.iter("parameter"):
        name = param.get("name")
        if not name:
            continue

        entry: dict | None = None
        bitmask_el = param.find("bitmask")
        if bitmask_el is not None:
            bits = []
            for bit in bitmask_el.findall("bit"):
                index = bit.get("index")
                if index is None:
                    continue
                bits.append({"index": int(index), "label": (bit.text or "").strip()})
            if bits:
                entry = {"kind": "bitmask", "bits": bits}

        if entry is None:
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
                    entry = {"kind": "enum", "options": options}

        if entry is None and param.get("boolean") == "true":
            entry = {"kind": "boolean"}

        unit = _param_unit(param)
        if entry is None and unit:
            entry = {}
        if entry is not None and unit:
            entry["unit"] = unit
        if entry:
            meta[name] = entry

    return meta


def write_param_meta_json(src: Path, dest: Path) -> dict:
    data = parse_param_meta(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write("\n")
    return data


if __name__ == "__main__":
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if dest is None:
        print(f"usage: python -m ea.replay.param_meta <dest>", file=sys.stderr)
        sys.exit(1)
    write_param_meta_json(DEFAULT_QGC_META, dest)
