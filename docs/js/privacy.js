/* Optional pseudonymization: real names never leave the browser; they are restored locally in the report. */
(function () {
  "use strict";

  const PSEUDONYMS = [
    "במבה", "ביסלי", "קרמבו", "שקשוקה", "פלאפל", "בורקס", "ג'חנון", "מלוואח", "סביח", "רוגלך",
    "קובה", "מטבוחה", "זעתר", "לאבנה", "שניצל", "קוסקוס", "חלבה", "תפוצ'יפס", "מקופלת", "טילון",
    "אבטיח", "פסטה", "קרואסון", "חמין", "פיצוחים", "סופגניה", "לביבה", "חצילון", "טחינה", "חומוס",
  ];
  const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function wordRe(word) {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, "gu");
  }

  /** Returns { messages, map: pseudonym -> real name } */
  function pseudonymize(messages, participants) {
    const allText = messages.map((m) => m.text).join("\n");
    const pool = PSEUDONYMS.filter((p) => !allText.includes(p));
    const toPseudo = new Map();
    participants.forEach((name, i) => {
      toPseudo.set(name, pool[i] || `משתתף/ת ${i + 1}`);
    });

    // Also catch first names inside message text ("יוני כהן" -> "יוני"), if unambiguous
    const firstNames = new Map();
    for (const name of participants) {
      const first = name.split(/\s+/)[0];
      if (first && first.length >= 2 && first !== name && !participants.includes(first)) {
        firstNames.set(first, firstNames.has(first) ? null : toPseudo.get(name));
      }
    }

    const replacers = [...toPseudo.entries()]
      .sort((a, b) => b[0].length - a[0].length)
      .map(([real, fake]) => [wordRe(real), fake]);
    for (const [first, fake] of firstNames) if (fake) replacers.push([wordRe(first), fake]);

    const out = messages.map((m) => {
      let text = m.text.replace(PHONE_RE, "[מספר טלפון]");
      for (const [re, fake] of replacers) text = text.replace(re, fake);
      return { ...m, sender: toPseudo.get(m.sender) || m.sender, text };
    });

    const map = new Map([...toPseudo.entries()].map(([real, fake]) => [fake, real]));
    const firstMap = new Map([...firstNames.entries()].filter(([, fake]) => fake).map(([first, fake]) => [fake, first]));
    return { messages: out, map, firstMap };
  }

  const QUOTE_KEYS = new Set(["quote", "evidence"]);

  /**
   * Deep-replace pseudonyms with real names in every string of the report.
   * Quotes are restored to whichever variant (full name / first name) actually appears in the original chat.
   */
  function restore(value, map, firstMap, originalCorpus) {
    if (!map || map.size === 0) return value;
    const sortPairs = (m) => [...m.entries()].sort((a, b) => b[0].length - a[0].length);
    const full = sortPairs(map);
    const first = sortPairs(new Map([...map, ...(firstMap || [])]));
    const apply = (s, pairs) => pairs.reduce((acc, [fake, real]) => acc.split(fake).join(real), s);
    const fixQuote = (s) => {
      const a = apply(s, full);
      if (!originalCorpus || originalCorpus.includes(a)) return a;
      const b = apply(s, first);
      return originalCorpus.includes(b) ? b : a;
    };
    const walk = (v, key) => {
      if (typeof v === "string") return QUOTE_KEYS.has(key) ? fixQuote(v) : apply(v, full);
      if (Array.isArray(v)) return v.map((x) => walk(x));
      if (v && typeof v === "object") {
        const o = {};
        for (const k of Object.keys(v)) o[k] = typeof v[k] === "boolean" ? v[k] : walk(v[k], k);
        return o;
      }
      return v;
    };
    return walk(value);
  }

  window.DramaPrivacy = { pseudonymize, restore };
})();
