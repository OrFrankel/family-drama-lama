/* Real numbers, computed locally in the browser — no AI involved. */
(function () {
  "use strict";

  const EMOJI_RE = /\p{Extended_Pictographic}/gu;

  function top(map) {
    let best = null;
    for (const [k, v] of map) if (v > 0 && (!best || v > best[1])) best = [k, v];
    return best;
  }

  function compute(messages) {
    const per = new Map();
    const voice = new Map();
    const night = new Map();
    const emoji = new Map();
    const questions = new Map();
    const shouting = new Map();
    const emojiCount = new Map();
    const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

    for (const msg of messages) {
      const s = msg.sender;
      inc(per, s);
      if (msg.isVoice) inc(voice, s);
      if (msg.hour !== null && (msg.hour >= 23 || msg.hour < 5)) inc(night, s);
      if (msg.isMedia || msg.isDeleted) continue;
      const emojis = msg.text.match(EMOJI_RE) || [];
      if (emojis.length) inc(emoji, s, emojis.length);
      for (const e of emojis) inc(emojiCount, e);
      if (msg.text.includes("?")) inc(questions, s);
      if (/[!?]{2,}/.test(msg.text)) inc(shouting, s);
    }

    const counts = [...per.entries()].sort((a, b) => b[1] - a[1]);
    const tiles = [];
    const add = (pair, icon, label, unit) => pair && tiles.push({ icon, label, name: pair[0], value: `${pair[1]} ${unit}` });
    add(top(per), "💬", "הכי פטפטן/ית", "הודעות");
    add(top(voice), "🎙️", "שגריר/ת ההודעות הקוליות", "הקלטות");
    add(top(night), "🦉", "ינשוף/ת הלילה (23:00–05:00)", "הודעות");
    add(top(emoji), "🤩", "אלוף/ת האימוג'ים", "אימוג'ים");
    add(top(questions), "❓", "הכי הרבה שאלות", "הודעות עם ?");
    add(top(shouting), "‼️", "מלך/ת סימני הקריאה הכפולים", "הודעות");

    const topEmoji = [...emojiCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { total: messages.length, counts, tiles, topEmoji };
  }

  window.DramaStats = { compute };
})();
