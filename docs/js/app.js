/* UI controller: inputs → parse → (AI | demo) → render. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const API_BASE = (window.DRAMA_LAMA_CONFIG && window.DRAMA_LAMA_CONFIG.apiBase) || "";
  const MAX_TRANSCRIPT_CHARS = 150000;

  const LOADING_MSGS = [
    "מחפשים מי התחיל את הריב...",
    "בודקים מי סינן את מי...",
    "מתייעצים עם הדודה שיודעת הכול...",
    "סופרים כמה פעמים נשאל \"מי מביא חד-פעמי\"...",
    "מאזינים להודעה הקולית של אבא (חלק 3 מתוך 7)...",
    "מצלמים מסך לפני שמישהו מוחק...",
    "מחלקים פסלוני זהב לפאסיב-אגרסיב...",
    "מודדים את רמת הסרקזם בסמיילי 🙂...",
    "מראיינים את מי שקרא ולא ענה...",
    "מכינים פופקורן 🍿...",
  ];

  const state = {
    tab: "file",
    fileText: "",
    fileLabel: "",
    aiAvailable: false,
    parsed: null,
    lastInput: null, // { messages, participants, isSample }
    report: null,
    mode: "ai",
    intensity: "normal",
  };

  // ---------- helpers ----------
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function showError(msg) {
    const box = $("errorBox");
    box.innerHTML = msg;
    box.hidden = !msg;
    if (msg) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const norm = (s) => String(s || "").replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/["“”„״]/g, '"').replace(/\s+/g, " ").trim();

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  // ---------- mode detection ----------
  async function checkHealth() {
    const badge = $("modeBadge");
    // Free-tier hosts sleep when idle and can take ~50s to wake up
    const slow = setTimeout(() => (badge.textContent = "⏳ השרת מתעורר… עוד רגע"), 4000);
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), API_BASE ? 70000 : 8000);
      const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal });
      const data = await res.json();
      state.aiAvailable = !!data.ai;
    } catch {
      state.aiAvailable = false;
    }
    clearTimeout(slow);
    badge.className = "mode-badge " + (state.aiAvailable ? "on" : "off");
    badge.textContent = state.aiAvailable ? "🟢 AI מחובר — ניתוח אמיתי" : "🎭 מצב דמו — אין AI מחובר";
    badge.title = state.aiAvailable
      ? "השיחה תנותח על ידי מודל שפה בשרת"
      : "אין שרת AI מחובר. אפשר לראות דוח לדוגמה, ולשיחות שלכם נציג רק סטטיסטיקות אמיתיות";
  }

  // ---------- tabs ----------
  document.querySelectorAll(".tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn);
      });
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === state.tab));
      showError("");
      updateSummary();
    })
  );

  // ---------- file input (.txt / .zip) ----------
  async function readFile(file) {
    showError("");
    const name = file.name || "";
    const isZip = /\.zip$/i.test(name) || file.type.includes("zip");
    try {
      if (isZip) {
        if (!window.JSZip) throw new Error("JSZIP");
        const zip = await window.JSZip.loadAsync(file);
        const txts = Object.values(zip.files).filter((f) => !f.dir && /\.txt$/i.test(f.name) && !f.name.startsWith("__MACOSX"));
        if (!txts.length) {
          showError("😬 לא מצאנו קובץ טקסט בתוך ה-zip. ודאו שזה קובץ ייצוא צ'אט מוואטסאפ.");
          return;
        }
        // Prefer WhatsApp's own file names, otherwise the biggest .txt
        const preferred = txts.find((f) => /(^|\/)_chat\.txt$|whatsapp|וואטסאפ|צ'אט/i.test(f.name));
        let chosen = preferred;
        if (!chosen) {
          const sized = await Promise.all(txts.map(async (f) => [f, (await f.async("string")).length]));
          chosen = sized.sort((a, b) => b[1] - a[1])[0][0];
        }
        state.fileText = await chosen.async("string");
        state.fileLabel = `📦 ${name} ← ${chosen.name.split("/").pop()}`;
      } else {
        if (file.size > 30 * 1024 * 1024) {
          showError("😮 הקובץ ענק (מעל 30MB). נסו לייצא בלי מדיה.");
          return;
        }
        state.fileText = await file.text();
        state.fileLabel = `📄 ${name}`;
      }
      $("fileName").textContent = state.fileLabel;
      updateSummary();
    } catch (e) {
      state.fileText = "";
      showError(
        e.message === "JSZIP"
          ? "לא הצלחנו לטעון את רכיב פתיחת ה-zip. בדקו חיבור לאינטרנט, או חלצו את קובץ ה-txt והעלו אותו."
          : "😬 לא הצלחנו לקרוא את הקובץ. אם זה zip — נסו לחלץ ממנו את קובץ ה-txt ולהעלות אותו ישירות."
      );
    }
  }

  $("fileInput").addEventListener("change", (e) => e.target.files[0] && readFile(e.target.files[0]));
  const dz = $("dropzone");
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => (e.preventDefault(), dz.classList.add("drag"))));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => (e.preventDefault(), dz.classList.remove("drag"))));
  dz.addEventListener("drop", (e) => e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]));
  $("pasteInput").addEventListener("input", () => updateSummary());

  $("previewSample").addEventListener("click", () => {
    const pre = $("samplePreview");
    pre.textContent = window.DRAMA_SAMPLE_CHAT;
    pre.hidden = !pre.hidden;
  });

  // ---------- parse ----------
  function currentRaw() {
    if (state.tab === "file") return state.fileText;
    if (state.tab === "paste") return $("pasteInput").value;
    return window.DRAMA_SAMPLE_CHAT;
  }

  function updateSummary() {
    const raw = currentRaw();
    const box = $("parseSummary");
    if (!raw || !raw.trim()) {
      box.hidden = true;
      return;
    }
    const p = window.DramaParser.parse(raw);
    state.parsed = p;
    if (!p.messages.length) {
      box.hidden = false;
      box.className = "parse-summary bad";
      box.innerHTML = "🤔 עדיין לא זיהינו הודעות בפורמט של וואטסאפ.";
      return;
    }
    box.hidden = false;
    box.className = "parse-summary";
    box.innerHTML =
      `✅ זיהינו <b>${p.messages.length}</b> הודעות מ-<b>${p.participants.length}</b> משתתפים: ` +
      p.participants.slice(0, 15).map((n) => `<span class="chip">${escapeHtml(n)}</span>`).join("") +
      (p.participants.length > 15 ? ` <span class="chip">+${p.participants.length - 15}</span>` : "");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // ---------- loading ----------
  let loadingTimer = null;
  function startLoading(sub) {
    const el = $("loading");
    el.hidden = false;
    $("loadingSub").textContent = sub;
    let i = Math.floor(Math.random() * LOADING_MSGS.length);
    const msg = $("loadingMsg");
    msg.textContent = LOADING_MSGS[i];
    loadingTimer = setInterval(() => {
      i = (i + 1) % LOADING_MSGS.length;
      msg.classList.remove("swap");
      void msg.offsetWidth;
      msg.classList.add("swap");
      msg.textContent = LOADING_MSGS[i];
    }, 2200);
  }
  function stopLoading() {
    clearInterval(loadingTimer);
    $("loading").hidden = true;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- quote verification (against what the model actually saw) ----------
  function verify(report, messages) {
    const corpus = norm(messages.map((m) => m.text).join("\n"));
    const ok = (q) => !!q && norm(q).length > 0 && corpus.includes(norm(q).replace(/^"|"$/g, ""));
    (report.cast || []).forEach((c) => (c.evidenceVerified = ok(c.evidence)));
    (report.awards || []).forEach((a) => (a.quoteVerified = ok(a.quote)));
    (report.iconicMoments || []).forEach((m) => (m.verified = ok(m.quote)));
    return report;
  }

  // ---------- analyze ----------
  async function analyze(intensity, reuse) {
    showError("");
    const raw = reuse && state.lastInput ? state.lastInput.raw : currentRaw();
    if (!raw || !raw.trim()) {
      showError(
        state.tab === "file"
          ? "📁 עוד לא העליתם קובץ. בחרו קובץ zip או txt של ייצוא הצ'אט."
          : "📋 תדביקו קודם את השיחה (או נסו את המשפחה לדוגמה 🎭)."
      );
      return;
    }
    const parsed = window.DramaParser.parse(raw);
    if (parsed.messages.length < 3) {
      showError(
        "🤔 לא הצלחנו לזהות את השיחה כייצוא של וואטסאפ. כל הודעה צריכה להתחיל בתאריך ושעה, למשל:<br><code dir=\"ltr\">14.11.2024, 09:15 - אמא: הודעה</code> או <code dir=\"ltr\">[14/11/2024, 09:15:30] אמא: הודעה</code>"
      );
      return;
    }
    const isSample = norm(raw) === norm(window.DRAMA_SAMPLE_CHAT);
    state.lastInput = { raw, isSample };
    state.intensity = intensity;
    const stats = window.DramaStats.compute(parsed.messages);

    if (!healthReady.done) {
      startLoading("מעירים את שרת ה-AI… (בפעם הראשונה זה יכול לקחת עד דקה)");
      await healthReady;
      stopLoading();
    }
    if (!state.aiAvailable) {
      startLoading("מצב דמו: אין AI מחובר, אז אנחנו לא מנתחים באמת — רק מכינים את הדוח לדוגמה.");
      await wait(1800);
      stopLoading();
      if (isSample) {
        const report = verify(structuredClone(window.DRAMA_DEMO_REPORTS[intensity]), parsed.messages);
        show({ report, stats, mode: "demo-sample" });
      } else {
        show({ report: null, stats, mode: "demo-stats-only" });
      }
      return;
    }

    // Real AI path
    let msgs = parsed.messages;
    let participants = parsed.participants;
    let nameMap = null;
    let firstMap = null;
    if ($("pseudoToggle").checked) {
      const p = window.DramaPrivacy.pseudonymize(msgs, participants);
      msgs = p.messages;
      nameMap = p.map;
      firstMap = p.firstMap;
      participants = participants.map((n) => [...p.map.entries()].find(([, real]) => real === n)[0]);
    }
    const { transcript, included, total } = window.DramaParser.toTranscript(msgs, MAX_TRANSCRIPT_CHARS);
    const truncated = included < total;
    const note = truncated ? `השיחה ארוכה, ולכן מוצגות רק ${included} ההודעות האחרונות מתוך ${total}.` : "";

    startLoading("ה-AI קורא את כל ההודעות. זה לוקח בערך דקה — דרמה טובה דורשת זמן.");
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, participants, intensity, note }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.report) throw new Error(data.error || `שגיאת שרת (${res.status})`);
      let report = verify(data.report, msgs);
      if (nameMap) report = window.DramaPrivacy.restore(report, nameMap, firstMap, parsed.messages.map((m) => m.text).join("\n"));
      show({
        report,
        stats,
        mode: "ai",
        notice: truncated ? `📏 השיחה ארוכה במיוחד, אז ה-AI ניתח את ${included.toLocaleString("he-IL")} ההודעות האחרונות (מתוך ${total.toLocaleString("he-IL")}). הסטטיסטיקות כוללות את כל השיחה.` : "",
      });
    } catch (e) {
      const offline = e instanceof TypeError;
      showError(`😵 ${offline ? "לא הצלחנו להגיע לשרת ה-AI. בדקו חיבור ונסו שוב." : escapeHtml(e.message)}`);
      if (!$("report").hidden) $("report").scrollIntoView({ behavior: "smooth" });
    } finally {
      stopLoading();
    }
  }

  function show({ report, stats, mode, notice }) {
    state.report = report;
    state.mode = mode;
    const container = $("reportContent");
    window.DramaRender.render(container, { report, stats, mode, notice });
    $("report").hidden = false;
    $("moreDramaBtn").hidden = !report;
    $("copyBtn").hidden = !report;
    $("shareReportBtn").hidden = !report;
    const demoExtra = mode === "demo-sample" && state.intensity === "extra";
    $("moreDramaBtn").textContent = demoExtra ? "😌 חזרה לגרסה הרגועה" : state.intensity === "extra" ? "🔥🔥 עוד יותר דרמה!" : "🔥 עוד דרמה!";
    window.DramaRender.animate(container);
    $("report").scrollIntoView({ behavior: "smooth" });
  }

  // ---------- actions ----------
  $("analyzeBtn").addEventListener("click", () => analyze("normal"));
  $("moreDramaBtn").addEventListener("click", () =>
    analyze(state.mode === "demo-sample" && state.intensity === "extra" ? "normal" : "extra", true)
  );
  $("newChatBtn").addEventListener("click", () => {
    $("report").hidden = true;
    $("reportContent").innerHTML = "";
    state.fileText = "";
    state.fileLabel = "";
    $("fileName").textContent = "";
    $("fileInput").value = "";
    $("pasteInput").value = "";
    $("parseSummary").hidden = true;
    state.lastInput = null;
    $("upload").scrollIntoView({ behavior: "smooth" });
  });

  $("copyBtn").addEventListener("click", async () => {
    const ok = await copyText(window.DramaRender.toText(state.report, state.mode));
    toast(ok ? "📋 הדוח הועתק! עכשיו להדביק בקבוצה ולברוח 🏃‍♀️" : "לא הצלחנו להעתיק 😕");
  });

  $("shareReportBtn").addEventListener("click", async () => {
    const text = window.DramaRender.toText(state.report, state.mode);
    const title = "FAMILY DRAMA-LAMA — " + state.report.headline;
    try {
      if (navigator.share) {
        let shareData = { title, text };
        try {
          const file = await window.DramaCards.toFile(await window.DramaCards.coverCard(state.report), "drama-lama-report.png");
          if (navigator.canShare && navigator.canShare({ files: [file], text })) shareData = { title, text, files: [file] };
        } catch {}
        await navigator.share(shareData);
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const ok = await copyText(text);
    toast(ok ? "📤 אין שיתוף מובנה בדפדפן הזה — הדוח המלא הועתק ללוח, אפשר להדביק בוואטסאפ" : "לא הצלחנו לשתף 😕");
  });

  $("reportContent").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "show-sample") {
      document.querySelector('.tab[data-tab="sample"]').click();
      analyze("normal");
      return;
    }
    if (btn.dataset.action === "share-award") {
      const award = state.report.awards[Number(btn.dataset.index)];
      btn.disabled = true;
      try {
        const file = await window.DramaCards.toFile(await window.DramaCards.awardCard(award), "drama-lama-award.png");
        const text = `🏆 ${award.title}: ${award.winner}!\n${award.explanation}\n— FAMILY DRAMA-LAMA 🦙`;
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text, title: award.title });
        } else {
          window.DramaCards.download(file);
          toast("🖼️ כרטיס הפרס ירד למחשב — מוכן לשליחה בקבוצה");
        }
      } catch (err) {
        if (!err || err.name !== "AbortError") toast("לא הצלחנו ליצור את הכרטיס 😕");
      } finally {
        btn.disabled = false;
      }
    }
  });

  // index.html#demo → jump straight into the sample report (classroom shortcut)
  const healthReady = checkHealth().then(() => (healthReady.done = true));
  healthReady.then(() => {
    if (location.hash === "#demo") {
      document.querySelector('.tab[data-tab="sample"]').click();
      analyze("normal");
    }
  });
})();
