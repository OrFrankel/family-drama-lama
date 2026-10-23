/* Shareable PNG cards drawn on <canvas> (RTL-safe, no external libs). */
(function () {
  "use strict";

  const W = 1080;
  const H = 1350;

  function wrap(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawLines(ctx, lines, x, y, lh, max) {
    const shown = lines.slice(0, max);
    if (lines.length > max) shown[max - 1] = shown[max - 1].replace(/\s*\S*$/, "") + "…";
    shown.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    return y + shown.length * lh;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function base() {
    await Promise.all([
      document.fonts.load('700 80px "Secular One"'),
      document.fonts.load('700 80px "Karantina"'),
      document.fonts.load('400 40px "Rubik"'),
      document.fonts.load('400 60px "Bungee"'),
    ]).catch(() => {});
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#ff2e88");
    g.addColorStop(0.55, "#9d4edd");
    g.addColorStop(1, "#3c096c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // confetti dots
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      ctx.arc((i * 197) % W, (i * 331) % H, 6 + (i % 5) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff6ea";
    roundRect(ctx, 70, 150, W - 140, H - 300, 48);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#160b1f";
    ctx.stroke();
    // masthead + footer
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff6ea";
    ctx.font = '400 64px "Bungee", sans-serif';
    ctx.fillText("FAMILY DRAMA-LAMA", W / 2, 105);
    ctx.font = '400 34px "Rubik", sans-serif';
    ctx.direction = "rtl";
    ctx.fillText("🦙 בידור בלבד · מבוסס על דרמה אמיתית מהקבוצה", W / 2, H - 70);
    return { c, ctx };
  }

  async function awardCard(award) {
    const { c, ctx } = await base();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    const cx = W / 2;
    const maxW = W - 260;

    ctx.font = "170px serif";
    ctx.fillText("🏆", cx, 380);
    ctx.font = "110px serif";
    ctx.fillText(award.emoji || "✨", cx + 150, 300);

    ctx.fillStyle = "#7b2cbf";
    ctx.font = '700 40px "Rubik", sans-serif';
    ctx.fillText("טקס הפרסים המשפחתי מעניק את", cx, 470);

    ctx.fillStyle = "#160b1f";
    ctx.font = '700 84px "Secular One", sans-serif';
    let y = drawLines(ctx, wrap(ctx, award.title, maxW), cx, 570, 96, 2);

    ctx.fillStyle = "#ff2e88";
    ctx.font = '700 120px "Karantina", sans-serif';
    ctx.fillText(award.winner, cx, y + 90);
    y += 170;

    ctx.fillStyle = "#2b1a33";
    ctx.font = '400 40px "Rubik", sans-serif';
    y = drawLines(ctx, wrap(ctx, award.explanation, maxW), cx, y, 56, 5);

    if (award.quote) {
      ctx.fillStyle = "#7b2cbf";
      ctx.font = '500 38px "Rubik", sans-serif';
      drawLines(ctx, wrap(ctx, `„${award.quote}"`, maxW), cx, Math.min(y + 50, H - 260), 52, 2);
    }
    return c;
  }

  async function coverCard(report) {
    const { c, ctx } = await base();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    const cx = W / 2;
    const maxW = W - 260;

    ctx.fillStyle = "#ff2e88";
    roundRect(ctx, cx - 210, 200, 420, 70, 35);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = '700 40px "Rubik", sans-serif';
    ctx.fillText("🔥 מבזק משפחתי 🔥", cx, 248);

    ctx.fillStyle = "#160b1f";
    ctx.font = '700 92px "Karantina", sans-serif';
    let y = drawLines(ctx, wrap(ctx, report.headline, maxW), cx, 370, 92, 4);

    ctx.fillStyle = "#7b2cbf";
    ctx.font = '700 230px "Bungee", sans-serif';
    ctx.direction = "ltr";
    ctx.fillText(String(report.dramaScore), cx, y + 230);
    ctx.font = '400 50px "Bungee", sans-serif';
    ctx.fillText("/100 DRAMA", cx, y + 300);
    ctx.direction = "rtl";

    ctx.fillStyle = "#2b1a33";
    ctx.font = '400 40px "Rubik", sans-serif';
    drawLines(ctx, wrap(ctx, report.dramaExplanation, maxW), cx, y + 380, 54, 3);
    return c;
  }

  function toFile(canvas, name) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(new File([b], name, { type: "image/png" })), "image/png"));
  }

  function download(file) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.DramaCards = { awardCard, coverCard, toFile, download };
})();
