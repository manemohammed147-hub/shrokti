/* نظام الصوت — موسيقى فقط (لا مؤثرات).
   ثلاثة سياقات:  lock = louk.mp3   |   app = pack.mp3   |   gharam = lara.mp3 (داخل الذكريات)
   يحترم سياسات المتصفح: إن مُنع التشغيل التلقائي تظهر دعوة أنيقة لبدء الموسيقى. */
(function () {
  'use strict';
  const CTX_OF = { louk: 'lock', pack: 'app', lara: 'gharam' };
  const LABELS = {
    lock: { title: 'شاشة الدخول', file: 'louk.mp3', path: 'assets/audio/lock-screen/louk.mp3' },
    app: { title: 'التطبيق', file: 'pack.mp3', path: 'assets/audio/app/pack.mp3' },
    gharam: { title: 'غرام', file: 'lara.mp3', path: 'assets/audio/memories/lara.mp3' },
  };

  const A = (Shr.audio = {
    tracks: {},
    current: null,      // السياق المطلوب حاليًا
    pending: null,      // سياق ينتظر إذن المستخدم
    master: 0.7,
    muted: false,
    userPaused: false,
    duckCount: 0,
    labels: LABELS,
    _subs: new Set(),
  });

  try {
    const v = parseFloat(localStorage.getItem('shr_vol'));
    if (!isNaN(v)) A.master = Math.min(1, Math.max(0, v));
    A.muted = localStorage.getItem('shr_muted') === '1';
  } catch (e) { /* التخزين غير متاح */ }

  A.subscribe = (fn) => { A._subs.add(fn); return () => A._subs.delete(fn); };
  const emit = () => A._subs.forEach((fn) => { try { fn(A.state()); } catch (e) { /* تجاهل */ } });

  A.init = function (assets) {
    Shr.$$('audio[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const info = assets[key] || {};
      const ctxName = CTX_OF[key];
      const t = { key, ctx: ctxName, el, url: info.url, exists: !!info.exists, error: false, gain: 0, timer: null };
      // موسيقى الدخول عامة؛ باقي الملفات لا تُطلب من الخادم إلا بعد فتح القفل
      if (t.exists && ctxName === 'lock') { el.src = info.url; el.preload = 'auto'; }
      el.addEventListener('play', emit);
      el.addEventListener('pause', emit);
      el.addEventListener('error', () => { t.error = true; emit(); });
      A.tracks[ctxName] = t;
    });
    A.applyVolumes();
  };

  const eff = (t) => (A.muted ? 0 : Math.min(1, A.master * t.gain * (A.duckCount > 0 ? 0.22 : 1)));
  A.applyVolumes = () => Object.values(A.tracks).forEach((t) => { try { t.el.volume = eff(t); } catch (e) { /* iOS */ } });

  function fade(t, to, ms) {
    clearInterval(t.timer);
    if (ms <= 0 || Shr.reducedMotion) { t.gain = to; A.applyVolumes(); return Promise.resolve(); }
    const from = t.gain, start = performance.now();
    return new Promise((resolve) => {
      t.timer = setInterval(() => {
        const k = Math.min(1, (performance.now() - start) / ms);
        t.gain = from + (to - from) * k;
        A.applyVolumes();
        if (k >= 1) { clearInterval(t.timer); resolve(); }
      }, 40);
    });
  }

  function stopTrack(t, ms) {
    if (t.el.paused) { t.gain = 0; return; }
    fade(t, 0, ms).then(() => { if (t.gain === 0) t.el.pause(); });
  }

  /** تبديل السياق الموسيقي مع مزج ناعم. */
  A.switchTo = async function (ctxName, opts = {}) {
    const ms = opts.fade === undefined ? 900 : opts.fade;
    A.current = ctxName;
    Object.values(A.tracks).forEach((t) => { if (t.ctx !== ctxName) stopTrack(t, ms); });
    const t = A.tracks[ctxName];
    if (!t || !t.exists || t.error) { emit(); return false; }
    if (A.userPaused && !opts.force) { emit(); return false; }
    try {
      if (!t.el.getAttribute('src')) { t.el.src = t.url; t.el.preload = 'auto'; }
      if (t.el.paused) { t.gain = Math.min(t.gain, 0.001); A.applyVolumes(); await t.el.play(); }
      A.pending = null;
      hidePrompt();
      fade(t, 1, ms);
      emit();
      return true;
    } catch (e) {
      if (e && e.name === 'NotAllowedError') { A.pending = ctxName; showPrompt(); }
      else { t.error = true; }
      emit();
      return false;
    }
  };

  A.stopAll = function () {
    A.current = null; A.pending = null;
    Object.values(A.tracks).forEach((t) => { clearInterval(t.timer); t.gain = 0; try { t.el.pause(); t.el.currentTime = 0; } catch (e) { /* */ } });
    hidePrompt(); emit();
  };

  A.togglePlay = async function () {
    const t = A.tracks[A.current];
    if (!t || !t.exists) return;
    if (!t.el.paused) { A.userPaused = true; await fade(t, 0, 400); t.el.pause(); emit(); }
    else { A.userPaused = false; await A.switchTo(A.current, { fade: 500, force: true }); }
  };
  A.setVolume = (v) => {
    A.master = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('shr_vol', String(A.master)); } catch (e) { /* */ }
    A.applyVolumes(); emit();
  };
  A.toggleMute = () => {
    A.muted = !A.muted;
    try { localStorage.setItem('shr_muted', A.muted ? '1' : '0'); } catch (e) { /* */ }
    A.applyVolumes(); emit();
  };
  A.duck = (on) => { A.duckCount = Math.max(0, A.duckCount + (on ? 1 : -1)); A.applyVolumes(); };
  A.resetPause = () => { A.userPaused = false; };

  A.state = function () {
    const t = A.tracks[A.current];
    return {
      current: A.current, master: A.master, muted: A.muted, userPaused: A.userPaused,
      playing: !!(t && !t.el.paused), exists: !!(t && t.exists && !t.error), pending: A.pending,
      tracks: Object.fromEntries(Object.entries(A.tracks).map(([k, v]) => [k, { exists: v.exists && !v.error, playing: !v.el.paused }])),
    };
  };

  /* ---------- دعوة التشغيل عند منع المتصفح ---------- */
  function showPrompt() {
    const lock = !Shr.$('#lock').hidden;
    const btn = lock ? Shr.$('#lockMusicBtn') : Shr.$('#musicPrompt');
    if (btn) btn.hidden = false;
  }
  function hidePrompt() {
    Shr.$('#lockMusicBtn').hidden = true;
    Shr.$('#musicPrompt').hidden = true;
  }
  const retry = () => { if (A.pending) A.switchTo(A.pending, { fade: 700, force: true }); };
  document.addEventListener('DOMContentLoaded', () => {
    Shr.$('#lockMusicBtn').addEventListener('click', retry);
    Shr.$('#musicPrompt').addEventListener('click', retry);
  });

  /* أول لمسة في الصفحة = إذن تشغيل: نعيد المحاولة ونهيّئ باقي المسارات (Safari) */
  let primed = false;
  const onGesture = () => {
    if (A.pending) retry();
    else if (A.current && !A.userPaused) {
      const t = A.tracks[A.current];
      if (t && t.exists && t.el.paused && !t.error) A.switchTo(A.current, { fade: 600 });
    }
    if (!primed) {
      primed = true;
      Object.values(A.tracks).forEach((t) => {
        if (t.exists && t.el.paused && t.ctx !== A.current && t.el.getAttribute('src')) {
          const el = t.el; const was = el.muted; el.muted = true;
          el.play().then(() => { if (A.current !== t.ctx) { el.pause(); el.currentTime = 0; } el.muted = was; }).catch(() => { el.muted = was; });
        }
      });
    }
  };
  window.addEventListener('pointerdown', onGesture, { passive: true });
  window.addEventListener('keydown', onGesture, { passive: true });
})();
