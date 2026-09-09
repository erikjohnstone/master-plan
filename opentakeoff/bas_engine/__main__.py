"""Bounded, one-shot JSON interface. No network, shell, secrets, or PDF parsing."""

from __future__ import annotations

import json
import sys

from pydantic import ValidationError

from .adapters import BlueprintInput, indexed_request
from .engine import calculate
from .models import Contract, EngineRequest, EngineResult

MAX_BYTES = 32 * 1024 * 1024


class Envelope(Contract):
    request: EngineRequest | None = None
    blueprint: BlueprintInput | None = None


def main() -> int:
    try:
        data = sys.stdin.buffer.read(MAX_BYTES+1)
        if len(data) > MAX_BYTES:
            raise ValueError("BAS input exceeds 32 MiB")
        envelope = Envelope.model_validate_json(data)
        if (envelope.request is None) == (envelope.blueprint is None):
            raise ValueError("provide exactly one request or blueprint payload")
        request = envelope.request
        if request is None:
            assert envelope.blueprint is not None
            request = indexed_request(envelope.blueprint)
        result = calculate(request)
        # Validate the output contract again before crossing a process boundary.
        output = EngineResult.model_validate(result.model_dump()).model_dump_json()
        if len(output.encode()) > MAX_BYTES:
            raise ValueError("BAS output exceeds 32 MiB")
        sys.stdout.write(output + "\n")
        return 0
    except (ValueError, ValidationError) as error:
        # Report the structural location, never echo potentially sensitive source text.
        detail = "Invalid BAS payload"
        if isinstance(error, ValidationError):
            fields = [".".join(map(str, e["loc"])) for e in error.errors(include_input=False)[:12]]
            detail += ": " + ", ".join(fields)
        else:
            detail = str(error)
        sys.stdout.write(json.dumps({"error": {"code": "BAS_VALIDATION_ERROR", "message": detail}}) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
