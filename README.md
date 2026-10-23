# 🦙 FAMILY DRAMA-LAMA

> כי בכל משפחה יש דרמה. אנחנו רק עושים ממנה כותרות.

You upload a WhatsApp family group export (`.zip` or `.txt`), and an AI writes a Hebrew gossip-magazine report about it: a breaking-news story, a cast of characters, a drama meter, an awards ceremony, power rankings, iconic quotes and a "next episode" teaser.

**Live demo:** https://orfrankel.github.io/family-drama-lama/ · instant sample report: https://orfrankel.github.io/family-drama-lama/#demo

## How it works

```
docs/                  static frontend (GitHub Pages serves this folder)
  index.html           page + llama mascot (inline SVG)
  styles.css           magazine look, RTL, responsive
  config.js            apiBase → where the AI backend lives (no keys!)
  js/parser.js         WhatsApp parser (Android/iOS, he/en, AM/PM, multiline)
  js/privacy.js        optional pseudonyms; real names restored only in the browser
  js/stats.js          real numbers computed locally (no AI)
  js/render.js         report → magazine layout + plain text
  js/cards.js          shareable PNG award/cover cards (canvas)
  js/app.js            UI controller (upload/zip, analyze, share, copy)
  js/sample-chat.js    fictional sample family chat
  js/demo-report.js    prewritten reports for the sample (demo mode only)
server/
  app.py               Python backend: serves docs/ + POST /api/analyze
  prompt.py            system prompt + JSON schema (separate from HTTP code)
render.yaml            one-click backend deploy on Render
```

- **The analysis runs on the server.** The browser parses the chat and sends a compact transcript to `/api/analyze`. The server calls Claude (`claude-opus-5-5`) with structured JSON output and sends the report back.
- **Quotes are checked.** Each quote in the report is matched against the original chat. It gets a "✓ ציטוט מקורי" badge if it appears word for word, or "≈ פרפרזה" if it doesn't.
- **Demo mode is labelled as demo.** If no backend is reachable, the built-in sample family shows a prewritten report marked as such. An uploaded chat gets only the real, locally computed stats. Nothing pretends to be AI analysis when it isn't.

## Privacy

- `.zip` files are opened in the browser. Only the chat `.txt` is read, and media is ignored.
- Chat text is never stored. The server keeps it in memory for the one request and doesn't log message contents (only method, path and status). The only third party it goes to is the AI provider.
- The **"להחליף שמות בכינויים"** toggle swaps participant names (and phone numbers) for pseudonyms before anything leaves the browser. The report is mapped back to the real names locally. Matching is basic: names with Hebrew prefixes (e.g. "ליוני") aren't replaced.

## Run locally

```bash
pip install -r server/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...        # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
python server/app.py                        # → http://localhost:8000
```

Without the key, the site runs in demo mode.

Optional env vars: `DRAMA_MODEL` (default `claude-opus-5-5`), `PORT`, `ALLOWED_ORIGINS` (comma-separated, default `*`), `RATE_LIMIT_PER_MIN` (default 6 per IP).

## Deploy

### 1. Frontend → GitHub Pages
Repo → Settings → Pages → *Deploy from a branch* → `main` / `/docs`. Without a backend, this alone gives you a working demo-mode site.

### 2. Backend (real AI) → Render (free)
1. https://dashboard.render.com → **New → Blueprint** → pick this repo (it reads `render.yaml`).
2. When prompted, paste your `ANTHROPIC_API_KEY`. It's stored as a Render secret and never goes in the repo.
3. If the Pages URL differs from `https://orfrankel.github.io`, update `ALLOWED_ORIGINS`.
4. Copy the service URL (e.g. `https://family-drama-lama.onrender.com`) into `docs/config.js`:
   ```js
   window.DRAMA_LAMA_CONFIG = { apiBase: "https://family-drama-lama.onrender.com" };
   ```
5. Commit and push. The badge on the site should turn to "🟢 AI מחובר".

Render's free tier sleeps when idle, so the first request can take about 50 seconds while the server wakes up. The site shows a "השרת מתעורר" message in the meantime.

The Render service also serves the frontend itself, so `https://<service>.onrender.com` works on its own too.

## Supported WhatsApp formats

```
14.11.2024, 09:15 - אמא: הודעה            (Android, he)
14/11/2024, 21:15 - Mom: message          (Android)
11/14/24, 9:15 PM - Mom: message          (Android, US)
[14/11/2024, 09:15:30] אמא: הודעה         (iOS)
14.11.2024, 9:15 אחה״צ - אמא: הודעה       (Hebrew AM/PM)
```

It handles multiline messages, system lines, media, voice notes, deleted messages and the invisible direction marks WhatsApp adds.

---
Entertainment only. Scores, awards and predictions are comic exaggeration, not facts or diagnoses. 🦙💖
