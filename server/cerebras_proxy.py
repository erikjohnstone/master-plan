"""Local-only Cerebras proxy — unblocks OpenTakeoff's Agent panel for a
solo demo with zero per-user setup.

What this is: a thin, unauthenticated pass-through, bound to 127.0.0.1 only
(never reachable off this machine). The browser talks to THIS server, never
to Cerebras directly — sidesteps the CORS-on-error-responses quirk we hit,
and means the real Cerebras key never has to leave this process. It reads
CEREBRAS_API_KEY from server/.env (same file the earlier demo script used)
and injects it server-side; nothing sent from the browser needs a key at all.

This is intentionally NOT the production design (no auth, no rate limit, no
multi-user story) — that's a separate, later piece for when this moves past
one person's own demo. See the conversation this came out of for that plan.

Run: source .venv/bin/activate && uvicorn cerebras_proxy:app --port 8811
"""
from __future__ import annotations

import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

API_KEY = os.environ.get("CEREBRAS_API_KEY", "").strip()
UPSTREAM = "https://api.cerebras.ai/v1"

app = FastAPI(title="Cerebras local proxy (demo only)")

# Local-only demo, single user (per the conversation this came from) — wide
# CORS is fine here specifically because the server itself is bound to
# 127.0.0.1 and reachable by no one but this machine's own browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "key_loaded": bool(API_KEY)}


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Response:
    if not API_KEY:
        return Response(
            content='{"error":"CEREBRAS_API_KEY not set in server/.env"}',
            status_code=500, media_type="application/json",
        )
    body = await request.body()
    async with httpx.AsyncClient(timeout=120) as client:
        upstream_resp = await client.post(
            f"{UPSTREAM}/chat/completions",
            content=body,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
        )
    return Response(
        content=upstream_resp.content,
        status_code=upstream_resp.status_code,
        media_type="application/json",
    )
