"""Quick demo — proves the NLP-query-to-intent piece of the pipeline works.

Not the production architecture (no auth, no multi-user proxy, no rate
limiting — see the conversation this came out of for that plan). This is
just: does Cerebras reliably turn a typed query like "show me all the globe
valves" into a structured filter our detection pipeline could apply?

Run: source .venv/bin/activate && python demo_cerebras_query.py
Needs a .env in this folder (copy .env.example) with a real CEREBRAS_API_KEY.
"""
from __future__ import annotations

import json
import os
import sys

from dotenv import load_dotenv
from cerebras.cloud.sdk import Cerebras

load_dotenv()

API_KEY = os.environ.get("CEREBRAS_API_KEY", "").strip()
MODEL = os.environ.get("CEREBRAS_MODEL", "gpt-oss-120b").strip()

if not API_KEY:
    sys.exit(
        "No CEREBRAS_API_KEY set.\n"
        "Copy server/.env.example to server/.env and paste your real key in "
        "there yourself — this script only reads the env var, it never "
        "takes the key as an argument or from stdin."
    )

# The known canonical classes this would filter over, once wired to the real
# detector — stand-in for canonical_taxonomy.yaml's class list (Step 2 of
# the training plan). Kept tiny and explicit so the model has no room to
# invent classes that don't exist in our taxonomy.
KNOWN_CLASSES = [
    "valve_ball", "valve_gate", "valve_globe", "valve_butterfly", "valve_check",
    "actuator_pneumatic", "actuator_electric",
    "damper_fire", "damper_smoke", "damper_volume",
    "ahu", "vav_box", "thermostat", "diffuser_supply", "diffuser_return",
]

SYSTEM_PROMPT = (
    "You translate a plain-English request about an HVAC/BAS blueprint into "
    "a structured filter. You may ONLY use class names from this exact list "
    f"(never invent new ones): {KNOWN_CLASSES}. "
    "Reply with JSON only, matching this shape: "
    '{"action": "highlight"|"count", "classes": ["<class>", ...]}. '
    "If the request maps to a parent category (e.g. \"valves\"), include "
    "every matching subclass from the list."
)


def ask(query: str) -> dict:
    client = Cerebras(api_key=API_KEY)
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)


if __name__ == "__main__":
    demo_queries = [
        "highlight all the globe valves",
        "show me every valve",
        "count the VAV boxes",
        "where are the fire dampers",
    ]
    for q in demo_queries:
        print(f"\n> {q}")
        try:
            print(json.dumps(ask(q), indent=2))
        except Exception as e:  # noqa: BLE001 — demo script, surface it plainly
            print(f"  (call failed: {e})")
