/* WhatsApp export parser — handles Android & iOS formats, Hebrew/English, multiline messages. */
(function () {
  "use strict";

  // Invisible direction marks / odd spaces WhatsApp sprinkles into exports
  const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
  const ODD_SPACES = /[   ]/g;

  // [31/12/2023, 21:15:30] Name: text            (iOS)
  // 31/12/2023, 21:15 - Name: text               (Android)
  // 12/31/23, 9:15 PM - Name: text               (Android, US)
  // 31.12.2023, 21:15 - Name: text               (Android, he/de)
  const LINE_RE = new RegExp(
    "^\\[?" +
      "(\\d{1,4}[./-]\\d{1,2}[./-]\\d{1,4})" + // date
      ",?\\s+" +
      "(\\d{1,2}[:.]\\d{2}(?:[:.]\\d{2})?)" + // time
      "\\s*([AaPp]\\.?\\s?[Mm]\\.?|לפנה\"צ|אחה\"צ|לפנה״צ|אחה״צ)?" + // am/pm
      "\\]?" +
      "\\s*(?:-|–|:)?\\s+" +
      "([\\s\\S]*)$"
  );

  const MEDIA_RE = /^<?(?:media omitted|המדיה לא נכללה|‏?מדיה הושמטה|image omitted|video omitted|audio omitted|sticker omitted|gif omitted|document omitted|תמונה הושמטה|סרטון הושמט|שמע הושמט|מדבקה הושמטה)>?$/i;
  const VOICE_RE = /^(?:<?(?:audio omitted|שמע הושמט)>?|PTT-\S+\.opus.*|\S+\.opus \((?:file attached|קובץ מצורף)\))$/i;
  const DELETED_RE = /^(this message was deleted|you deleted this message|הודעה זו נמחקה|מחקת את ההודעה הזו)$/i;

  function clean(s) {
    return s.replace(INVISIBLE, "").replace(ODD_SPACES, " ");
  }

  function parseHour(time, ampm) {
    let h = parseInt(time.split(/[:.]/)[0], 10);
    if (ampm) {
      const pm = /^[Pp]|אחה/.test(ampm);
      const am = /^[Aa]|לפנה/.test(ampm);
      if (pm && h < 12) h += 12;
      if (am && h === 12) h = 0;
    }
    return isNaN(h) ? null : h;
  }

  /**
   * Split "Name: text" — sender names never contain ": " in practice, and
   * system lines ("X added Y", encryption notice) have no colon separator.
   */
  function splitSender(rest) {
    const idx = rest.indexOf(": ");
    if (idx <= 0 || idx > 60) {
      // Edge: "Name:" with empty text
      if (/^[^:]{1,60}:$/.test(rest)) return { sender: rest.slice(0, -1).trim(), text: "" };
      return null;
    }
    return { sender: rest.slice(0, idx).trim(), text: rest.slice(idx + 2) };
  }

  function parse(raw) {
    if (typeof raw !== "string") return { messages: [], participants: [], systemCount: 0, unparsedLines: 0 };
    const lines = clean(raw).replace(/\r\n?/g, "\n").split("\n");
    const messages = [];
    let systemCount = 0;
    let unparsedLines = 0;
    let current = null;

    for (const line of lines) {
      const m = line.match(LINE_RE);
      if (m) {
        const [, date, time, ampm, rest] = m;
        const split = splitSender(rest);
        if (!split) {
          systemCount++;
          current = null;
          continue;
        }
        current = {
          date,
          time: time.replace(".", ":") + (ampm ? " " + ampm : ""),
          hour: parseHour(time, ampm),
          sender: split.sender,
          text: split.text,
        };
        messages.push(current);
      } else if (current) {
        current.text += "\n" + line; // multiline message continuation
      } else if (line.trim()) {
        unparsedLines++;
      }
    }

    for (const msg of messages) {
      msg.text = msg.text.trim();
      msg.isMedia = MEDIA_RE.test(msg.text) || /\(file attached\)$|\(קובץ מצורף\)$/.test(msg.text);
      msg.isVoice = VOICE_RE.test(msg.text);
      msg.isDeleted = DELETED_RE.test(msg.text);
    }

    const counts = new Map();
    for (const msg of messages) counts.set(msg.sender, (counts.get(msg.sender) || 0) + 1);
    const participants = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

    return { messages, participants, systemCount, unparsedLines };
  }

  /** Compact transcript for the model: "[date time] Name: text" */
  function toTranscript(messages, maxChars) {
    const out = [];
    let total = 0;
    // Keep the most recent messages if the chat is too long
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      let text = m.text;
      if (m.isVoice) text = "[הודעה קולית]";
      else if (m.isMedia) text = "[מדיה]";
      else if (m.isDeleted) text = "[הודעה נמחקה]";
      const line = `[${m.date} ${m.time}] ${m.sender}: ${text}`;
      if (total + line.length + 1 > maxChars) break;
      out.push(line);
      total += line.length + 1;
    }
    out.reverse();
    return { transcript: out.join("\n"), included: out.length, total: messages.length };
  }

  window.DramaParser = { parse, toTranscript };
})();
