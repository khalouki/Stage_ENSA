from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.models.machine import Machine


@dataclass(frozen=True)
class ExtractedMachine:
    id: int
    name: str
    matched_text: str


@dataclass(frozen=True)
class EntityExtractionResult:
    machines: list[ExtractedMachine]
    unknown_machine_reference: str | None = None


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    lowered = without_accents.lower()
    lowered = re.sub(r"[_-]+", " ", lowered)
    lowered = re.sub(r"[^a-z0-9\s#]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _machine_aliases(machine: Machine) -> set[str]:
    aliases = {machine.name}
    aliases.add(machine.name.replace("_", "-"))
    aliases.add(machine.name.replace("_", " "))
    aliases.add(machine.name.replace("-", "_"))
    aliases.add(machine.name.replace("-", " "))
    if machine.id is not None:
        aliases.add(f"machine {machine.id}")
        aliases.add(f"#{machine.id}")
    return {normalize_text(alias) for alias in aliases if alias}


def extract_entities(message: str, machines: list[Machine]) -> EntityExtractionResult:
    text = normalize_text(message)
    matches: list[ExtractedMachine] = []
    seen_ids: set[int] = set()

    for machine in machines:
        if machine.id is None:
            continue
        for alias in sorted(_machine_aliases(machine), key=len, reverse=True):
            if alias and re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", text):
                if machine.id not in seen_ids:
                    matches.append(ExtractedMachine(id=machine.id, name=machine.name, matched_text=alias))
                    seen_ids.add(machine.id)
                break

    if matches:
        return EntityExtractionResult(machines=matches)

    unknown_match = re.search(r"\b(?:cnc|printer|machine|laser)[\s_-]*\d+\b", text)
    return EntityExtractionResult(
        machines=[],
        unknown_machine_reference=unknown_match.group(0) if unknown_match else None,
    )
