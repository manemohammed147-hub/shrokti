/* جسيمات ناعمة وقلوب طافية على canvas واحد — خفيفة ومتوقفة عند إخفاء التبويب */
(function () {
  'use strict';
  const cv = document.getElementById('fx');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0;
  const dust = [], hearts = [];
  const moods = {
    default: { dust: 34, hearts: 6, blue: 0.5 },
    vault: { dust: 64, hearts: 4, blue: 0.62 },
    calm: { dust: 18, hearts: 3, blue: 0.5 },
  };
  let mood = moods.default;

  function sprite(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return c;
  }
  const dot = (color) => sprite(48, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, color + '1)'); r.addColorStop(0.35, color + '.35)'); r.addColorStop(1, color + '0)');
    g.fillStyle = r; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 7); g.fill();
  });
  const heart = (color) => sprite(64, (g, s) => {
    g.shadowColor = color + '.9)'; g.shadowBlur = 10;
    g.fillStyle = color + '.85)';
    g.translate(s / 2, s / 2 + 3);
    g.beginPath();
    g.moveTo(0, 14); g.bezierCurveTo(-26, -2, -14, -22, 0, -8); g.bezierCurveTo(14, -22, 26, -2, 0, 14);
    g.fill();
  });
  const S = {
    dotRose: dot('rgba(255,110,170,'), dotBlue: dot('rgba(110,190,255,'),
    heartRose: heart('rgba(255,90,160,'), heartBlue: heart('rgba(100,180,255,'),
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const scale = () => (W < 640 ? 0.6 : 1);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function mkDust(initial) {
    return { x: rnd(0, W), y: initial ? rnd(0, H) : H + 20, s: rnd(6, 20), vy: rnd(4, 14), sw: rnd(0, 6.28), sp: rnd(0.2, 0.7), a: rnd(0.25, 0.75), b: Math.random() < mood.blue };
  }
  function mkHeart(initial) {
    return { x: rnd(0, W), y: initial ? rnd(0, H) : H + 40, s: rnd(12, 26), vy: rnd(10, 22), sw: rnd(0, 6.28), sp: rnd(0.3, 0.8), a: rnd(0.12, 0.38), b: Math.random() < 0.4 };
  }
  function fill() {
    const k = scale();
    const wantD = Math.round(mood.dust * k), wantH = Math.round(mood.hearts * k);
    while (dust.length < wantD) dust.push(mkDust(true));
    while (dust.length > wantD) dust.pop();
    while (hearts.length < wantH) hearts.push(mkHeart(true));
    while (hearts.length > wantH) hearts.pop();
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 28) return; // ~35fps تكفي وتوفّر البطارية
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      p.y -= p.vy * dt; p.sw += p.sp * dt;
      const x = p.x + Math.sin(p.sw) * 14;
      if (p.y < -30) dust[i] = mkDust(false);
      ctx.globalAlpha = p.a * Math.min(1, (H - p.y) / 120, p.y / 90 + 0.2);
      ctx.drawImage(p.b ? S.dotBlue : S.dotRose, x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    for (let i = 0; i < hearts.length; i++) {
      const p = hearts[i];
      p.y -= p.vy * dt; p.sw += p.sp * dt;
      const x = p.x + Math.sin(p.sw) * 26;
      if (p.y < -50) hearts[i] = mkHeart(false);
      ctx.globalAlpha = p.a * Math.min(1, p.y / 140 + 0.1);
      ctx.drawImage(p.b ? S.heartBlue : S.heartRose, x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function start() { if (!raf && !Shr.reducedMotion) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  window.addEventListener('resize', () => { resize(); fill(); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  resize(); fill();
  if (Shr.reducedMotion) { frame(100); stop(); } else start();

  Shr.fx = {
    setMood(name) { mood = moods[name] || moods.default; fill(); },
  };
})();
