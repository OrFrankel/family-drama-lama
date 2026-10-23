/*
 * Where the AI backend lives.
 *  - ""  -> same origin (when the site is served by server/app.py, locally or on Render)
 *  - "https://your-backend.onrender.com" -> when the site is hosted on GitHub Pages
 * If the backend can't be reached, the site runs in a clearly-labelled demo mode.
 * No API keys here, ever. The key lives only on the backend.
 */
window.DRAMA_LAMA_CONFIG = {
  apiBase: "",
};
