/* Turns a report object into the magazine layout + a plain-text version for copy/share. */
(function () {
  "use strict";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const TREND = { up: ["▲", "trend-up", "בעלייה"], down: ["▼", "trend-down", "בירידה"], steady: ["●", "trend-steady", "יציב"] };
  const CARD_COLORS = ["c-pink", "c-purple", "c-cream", "c-black", "c-hot", "c-lilac"];

  function quoteBadge(verified) {
    return verified
      ? `<span class="qbadge ok" title="הטקסט נמצא מילה במילה בשיחה">✓ ציטוט מקורי</span>`
      : `<span class="qbadge warn" title="לא מצאנו את הטקסט המדויק בשיחה — התייחסו אליו כפרפרזה">≈ פרפרזה</span>`;
  }

  function scoreLabel(score) {
    if (score >= 90) return "כוננות עליונה 🚨";
    if (score >= 75) return "סערה מתקרבת ⛈️";
    if (score >= 50) return "מבעבע 🍲";
    if (score >= 25) return "פסיב-אגרסיב קל 🙂";
    return "שקט מחשיד 😶";
  }

  function banner(mode) {
    if (mode === "ai") return "";
    if (mode === "demo-sample")
      return `<div class="demo-banner">🎭 <b>מצב דמו:</b> זה דוח שנכתב מראש על המשפחה הבדיונית לדוגמה. הוא לא נוצר עכשיו על ידי AI. כדי לנתח שיחות אמיתיות, צריך לחבר שרת AI (ההוראות ב-README).</div>`;
    return `<div class="demo-banner">🎭 <b>מצב דמו — אין חיבור ל-AI:</b> לא נוכל לכתוב דוח רכילות על השיחה שלכם בלי AI, ולא נעמיד פנים שכן. מה שכן יש פה: <b>סטטיסטיקות אמיתיות</b> מהשיחה שלכם, שחושבו בדפדפן. <button class="link-btn" data-action="show-sample">לראות דוח לדוגמה של משפחה בדיונית ←</button></div>`;
  }

  function statsSection(stats, title) {
    if (!stats || !stats.total) return "";
    const max = stats.counts[0]?.[1] || 1;
    const bars = stats.counts
      .slice(0, 12)
      .map(
        ([name, n], i) => `
        <div class="bar-row">
          <span class="bar-name">${esc(name)}</span>
          <span class="bar"><span style="--w:${Math.max(4, (n / max) * 100)}%;--d:${i * 80}ms"></span></span>
          <span class="bar-val">${n}</span>
        </div>`
      )
      .join("");
    const tiles = stats.tiles
      .map((t) => `<div class="stat-tile"><span class="st-icon">${t.icon}</span><span class="st-label">${esc(t.label)}</span><b>${esc(t.name)}</b><small>${esc(t.value)}</small></div>`)
      .join("");
    const emojis = stats.topEmoji.length
      ? `<p class="top-emoji">האימוג'ים הכי פופולריים בקבוצה: ${stats.topEmoji.map(([e, n]) => `<span>${e}<small>×${n}</small></span>`).join("")}</p>`
      : "";
    return `
      <section class="block stats reveal">
        <h2 class="block-title"><span>📊</span> ${esc(title)}</h2>
        <p class="block-sub">מספרים אמיתיים מהשיחה, בלי AI ובלי הגזמה — חושבו כאן בדפדפן מתוך ${stats.total} הודעות.</p>
        <div class="stat-tiles">${tiles}</div>
        <div class="bars">${bars}</div>
        ${emojis}
      </section>`;
  }

  function render(container, { report, stats, mode, notice }) {
    if (!report) {
      container.innerHTML = banner(mode) + statsSection(stats, "הקבוצה שלכם במספרים");
      return;
    }
    const r = report;
    const score = Math.max(0, Math.min(100, Number(r.dramaScore) || 0));
    const today = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

    const article = (r.article || []).map((p, i) => `<p${i === 0 ? ' class="dropcap"' : ""}>${esc(p)}</p>`).join("");

    const cast = (r.cast || [])
      .map(
        (c, i) => `
        <article class="cast-card ${CARD_COLORS[i % CARD_COLORS.length]} reveal" style="--d:${i * 70}ms">
          <div class="cast-emoji">${esc(c.emoji || "⭐")}</div>
          <h3 class="cast-name">${esc(c.name)}</h3>
          <p class="cast-nick">"${esc(c.nickname)}"</p>
          <p class="cast-desc">${esc(c.description)}</p>
          ${c.evidence ? `<blockquote class="cast-evidence">${esc(c.evidence)} ${quoteBadge(c.evidenceVerified)}</blockquote>` : ""}
        </article>`
      )
      .join("");

    const awards = (r.awards || [])
      .map(
        (a, i) => `
        <article class="award reveal" style="--d:${i * 80}ms">
          <div class="trophy"><span class="trophy-cup">🏆</span><span class="trophy-emoji">${esc(a.emoji || "✨")}</span></div>
          <h3>${esc(a.title)}</h3>
          <p class="winner">🎉 ${esc(a.winner)}</p>
          <p class="award-why">${esc(a.explanation)}</p>
          ${a.quote ? `<blockquote>"${esc(a.quote)}" ${quoteBadge(a.quoteVerified)}</blockquote>` : ""}
          <button class="btn btn-mini" data-action="share-award" data-index="${i}">📤 שיתוף הפרס</button>
        </article>`
      )
      .join("");

    const rankings = (r.powerRankings || [])
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((p, i) => {
        const [sym, cls, label] = TREND[p.trend] || TREND.steady;
        return `
        <li class="rank-row reveal" style="--d:${i * 70}ms">
          <span class="rank-num">#${esc(p.rank)}</span>
          <div class="rank-body">
            <div class="rank-head"><b>${esc(p.name)}</b><span class="rank-title">${esc(p.title)}</span></div>
            <p>${esc(p.description)}</p>
          </div>
          <span class="trend ${cls}" title="${label}">${sym}</span>
        </li>`;
      })
      .join("");

    const moments = (r.iconicMoments || [])
      .map(
        (m, i) => `
        <article class="moment reveal" style="--d:${i * 80}ms">
          <div class="moment-num">${i + 1}</div>
          <div class="chat-bubble">
            <span class="cb-sender">${esc(m.sender)}</span>
            <p>${esc(m.quote)}</p>
            <span class="cb-time" dir="ltr">${esc(m.timestamp)}</span>
          </div>
          <div class="moment-meta">${quoteBadge(m.verified)}</div>
          <p class="commentary"><span class="commentary-label">🎙️ פרשנות הדרמה-למה:</span> ${esc(m.commentary)}</p>
        </article>`
      )
      .join("");

    const predictions = (r.nextEpisode?.predictions || []).map((p) => `<li>🔮 ${esc(p)}</li>`).join("");

    container.innerHTML = `
      ${banner(mode)}
      ${notice ? `<div class="notice">${esc(notice)}</div>` : ""}
      <div class="masthead reveal">
        <span class="mh-issue">גיליון ${Math.floor(Math.random() * 900 + 100)} · ${today}</span>
        <span class="mh-logo" dir="ltr">DRAMA-LAMA</span>
        <span class="mh-price">מחיר: 3 הודעות קוליות</span>
      </div>

      <section class="breaking reveal">
        <span class="breaking-tag">🔴 מבזק משפחתי</span>
        <h1 class="headline">${esc(r.headline)}</h1>
        <p class="subheadline">${esc(r.subheadline)}</p>
        <div class="article">${article}</div>
      </section>

      <section class="block meter-block reveal">
        <h2 class="block-title"><span>🌡️</span> מד הדרמה</h2>
        <div class="meter" data-score="${score}">
          <svg viewBox="0 0 220 130" class="meter-svg" aria-hidden="true">
            <defs><linearGradient id="mg" x1="0" x2="1"><stop offset="0" stop-color="#ffd6e8"/><stop offset=".5" stop-color="#ff2e88"/><stop offset="1" stop-color="#5a189a"/></linearGradient></defs>
            <path d="M20 115 A90 90 0 0 1 200 115" fill="none" stroke="#2b1a3322" stroke-width="22" stroke-linecap="round"/>
            <path class="meter-arc" d="M20 115 A90 90 0 0 1 200 115" fill="none" stroke="url(#mg)" stroke-width="22" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
            <g class="needle" style="--angle:${-90 + score * 1.8}deg"><line x1="110" y1="115" x2="110" y2="38" stroke="#160b1f" stroke-width="5" stroke-linecap="round"/><circle cx="110" cy="115" r="10" fill="#160b1f"/></g>
          </svg>
          <div class="meter-score" dir="ltr"><span class="meter-num">0</span><small>/100</small></div>
          <div class="meter-label">${scoreLabel(score)}</div>
        </div>
        <p class="meter-text">${esc(r.dramaExplanation)}</p>
        <p class="fineprint">* ציון בידורי בלבד. לא מדד מדעי, לא אבחנה, ולא סיבה לצאת מהקבוצה.</p>
      </section>

      <section class="block reveal">
        <h2 class="block-title"><span>🎬</span> הכירו את הקאסט</h2>
        <div class="cast-grid">${cast}</div>
      </section>

      <section class="block awards-block reveal">
        <h2 class="block-title"><span>🏆</span> טקס פרסי המשפחה</h2>
        <div class="awards-grid">${awards}</div>
      </section>

      <section class="block reveal">
        <h2 class="block-title"><span>👑</span> דירוג הכוח המשפחתי</h2>
        <p class="block-sub">מי באמת מנהל את הקבוצה? (דירוג בידורי, לא ייעוץ זוגי)</p>
        <ol class="rankings">${rankings}</ol>
      </section>

      <section class="block reveal">
        <h2 class="block-title"><span>💥</span> הרגעים האייקוניים</h2>
        <p class="block-sub">בבועה: הטקסט כפי שנכתב בקבוצה. מתחת: הפרשנות (המוגזמת) שלנו.</p>
        <div class="moments">${moments}</div>
      </section>

      ${statsSection(stats, "ובינתיים, במספרים")}

      <section class="block next-episode reveal">
        <span class="humor-tag">🔮 תחזית הומוריסטית · לא נבואה</span>
        <h2 class="block-title"><span>📺</span> בפרק הבא…</h2>
        <p class="teaser">${esc(r.nextEpisode?.teaser)}</p>
        <ul class="predictions">${predictions}</ul>
      </section>`;
  }

  function toText(r, mode) {
    if (!r) return "";
    const L = [];
    L.push("🦙 FAMILY DRAMA-LAMA 🦙");
    if (mode !== "ai") L.push("(דוח לדוגמה — מצב דמו)");
    L.push("", `🔴 ${r.headline}`, r.subheadline, "", ...(r.article || []), "");
    L.push(`🌡️ מד הדרמה: ${r.dramaScore}/100 — ${r.dramaExplanation}`, "");
    L.push("🎬 הקאסט:");
    (r.cast || []).forEach((c) => L.push(`${c.emoji} ${c.name} — "${c.nickname}": ${c.description}`));
    L.push("", "🏆 טקס הפרסים:");
    (r.awards || []).forEach((a) => L.push(`${a.emoji} ${a.title}: ${a.winner} — ${a.explanation}${a.quote ? ` („${a.quote}")` : ""}`));
    L.push("", "👑 דירוג הכוח:");
    (r.powerRankings || []).slice().sort((a, b) => a.rank - b.rank).forEach((p) => L.push(`#${p.rank} ${p.name} (${p.title}) — ${p.description}`));
    L.push("", "💥 רגעים אייקוניים:");
    (r.iconicMoments || []).forEach((m, i) => L.push(`${i + 1}. ${m.sender}: „${m.quote}"`, `   ← ${m.commentary}`));
    L.push("", `📺 בפרק הבא (תחזית הומוריסטית): ${r.nextEpisode?.teaser || ""}`);
    (r.nextEpisode?.predictions || []).forEach((p) => L.push(`🔮 ${p}`));
    L.push("", "* בידור בלבד 🦙💖");
    return L.join("\n");
  }

  /** Reveal-on-scroll + drama meter animation */
  function animate(container) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
          if (e.target.classList.contains("meter-block")) runMeter(e.target.querySelector(".meter"));
        }
      },
      { threshold: 0.15 }
    );
    container.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  function runMeter(meter) {
    if (!meter) return;
    const score = Number(meter.dataset.score);
    meter.classList.add("go");
    meter.querySelector(".meter-arc").style.strokeDashoffset = String(100 - score);
    const num = meter.querySelector(".meter-num");
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 1600);
      num.textContent = Math.round(score * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
      else if (score >= 75) meter.classList.add("shake");
    };
    requestAnimationFrame(step);
  }

  window.DramaRender = { render, toText, animate };
})();
