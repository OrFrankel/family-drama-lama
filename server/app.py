"""FAMILY DRAMA-LAMA backend.

- Serves the static site from ../docs (handy for local dev).
- POST /api/analyze  -> calls Claude and returns the report JSON.
- GET  /api/health   -> tells the frontend whether real AI is configured.

Privacy: chat text lives only in memory for the duration of the request. It is never
written to disk and never logged (the access log records method, path and status only).
"""

import json
import os
import sys
import time
from collections import defaultdict, deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import anthropic

from prompt import REPORT_SCHEMA, SYSTEM_PROMPT, build_user_message

MODEL = os.environ.get("DRAMA_MODEL", "claude-opus-5-5")
PORT = int(os.environ.get("PORT", "8000"))
STATIC_DIR = Path(__file__).resolve().parent.parent / "docs"
MAX_BODY = 1_500_000  # bytes
MAX_TRANSCRIPT = 200_000  # chars; the client already trims to fit
RATE_LIMIT = int(os.environ.get("RATE_LIMIT_PER_MIN", "6"))
# Comma-separated list, e.g. "https://orfrankel.github.io". "*" allows any origin.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

client = anthropic.Anthropic() if os.environ.get("ANTHROPIC_API_KEY") else None
_hits: dict[str, deque] = defaultdict(deque)


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def rate_limited(ip: str) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return True
    q.append(now)
    return False


def generate_report(transcript: str, participants: list[str], intensity: str, note: str) -> dict:
    if client is None:
        raise ApiError(503, "ה-AI לא מוגדר בשרת (חסר ANTHROPIC_API_KEY).")
    try:
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=32000,
            system=SYSTEM_PROMPT,
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": REPORT_SCHEMA}},
            # On a safety decline, the API re-runs the request on a fallback model automatically
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": build_user_message(transcript, participants, intensity, note)}],
        ) as stream:
            message = stream.get_final_message()
    except anthropic.AuthenticationError:
        raise ApiError(500, "מפתח ה-API בשרת לא תקין.")
    except anthropic.RateLimitError:
        raise ApiError(429, "יותר מדי דרמה בבת אחת! נסו שוב בעוד דקה.")
    except anthropic.APIStatusError as e:
        raise ApiError(502, f"שירות ה-AI החזיר שגיאה ({e.status_code}). נסו שוב.")
    except anthropic.APIConnectionError:
        raise ApiError(502, "לא הצלחנו להתחבר לשירות ה-AI. נסו שוב.")

    if message.stop_reason == "refusal":
        raise ApiError(422, "ה-AI סירב לנתח את השיחה הזאת. נסו שיחה אחרת.")
    if message.stop_reason == "max_tokens":
        raise ApiError(502, "הדוח יצא ארוך מדי ונקטע. נסו שוב.")

    texts = [b.text for b in message.content if b.type == "text"]
    for text in reversed(texts):
        try:
            report = json.loads(text)
            break
        except json.JSONDecodeError:
            continue
    else:
        raise ApiError(502, "קיבלנו תשובה לא תקינה מה-AI. נסו שוב.")

    report["dramaScore"] = max(0, min(100, int(report.get("dramaScore", 50))))
    return report


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    # Log only method/path/status — never request bodies.
    def log_message(self, fmt, *args):
        sys.stderr.write(f"{self.log_date_time_string()} {self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}\n")

    def _cors(self):
        origin = self.headers.get("Origin")
        if "*" in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", "*")
        elif origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/health":
            return self._json(200, {"ai": client is not None, "model": MODEL if client else None})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/analyze":
            return self._json(404, {"error": "לא נמצא"})
        try:
            ip = (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()
            if rate_limited(ip):
                raise ApiError(429, "וואו, הרבה דרמה! חכו דקה ונסו שוב.")
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                raise ApiError(413, "השיחה גדולה מדי.")
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            transcript = str(data.get("transcript", ""))[-MAX_TRANSCRIPT:]
            participants = [str(p)[:80] for p in data.get("participants", [])][:40]
            intensity = data.get("intensity") if data.get("intensity") in ("normal", "extra") else "normal"
            note = str(data.get("note", ""))[:300]
            if len(transcript.strip()) < 20 or not participants:
                raise ApiError(400, "לא מצאנו מספיק הודעות לניתוח.")
            self._json(200, {"report": generate_report(transcript, participants, intensity, note), "model": MODEL})
        except ApiError as e:
            self._json(e.status, {"error": e.message})
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "הבקשה לא תקינה."})
        except Exception as e:  # noqa: BLE001 — never leak details or chat content
            sys.stderr.write(f"analyze failed: {type(e).__name__}\n")
            self._json(500, {"error": "משהו השתבש בשרת. נסו שוב."})


if __name__ == "__main__":
    print(f"FAMILY DRAMA-LAMA on http://localhost:{PORT}  (AI: {'ON, ' + MODEL if client else 'OFF — demo mode'})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
