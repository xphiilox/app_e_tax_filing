#!/usr/bin/env python3
"""Copy the transitive official XSD dependency set for PKO0420 into the validator bundle."""

import shutil
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "e-taxall/19XMLスキーマ"
TARGET = ROOT / "schemas/r08"
ENTRYPOINT = SOURCE / "shotoku/PKO0420-260.xsd"


def dependencies(entrypoint):
    pending = [entrypoint.resolve()]
    seen = set()
    while pending:
        source = pending.pop()
        if source in seen:
            continue
        seen.add(source)
        root = ET.parse(source).getroot()
        for child in root:
            if child.tag.rsplit("}", 1)[-1] not in {"include", "import"}:
                continue
            location = child.get("schemaLocation")
            if not location:
                continue
            dependency = (source.parent / location).resolve()
            if dependency.is_file() and dependency not in seen:
                pending.append(dependency)
    return seen


def main():
    copied = dependencies(ENTRYPOINT)
    for source in copied:
        destination = TARGET / source.relative_to(SOURCE.resolve())
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    print(f"copied {len(copied)} official schemas to {TARGET}")


if __name__ == "__main__":
    main()
