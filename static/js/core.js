/* شروكتي — النواة: أدوات DOM، عميل الـ API، الصور الاحتياطية، مكوّنات الواجهة المشتركة */
(function () {
  'use strict';
  const Shr = (window.Shr = { views: {}, state: { who: null, whoName: null, assets: {} } });

  /* ---------- DOM ---------- */
  Shr.$ = (sel, root) => (root || document).querySelector(sel);
  Shr.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** إنشاء عنصر بأمان (النص يُدرج دائمًا كنص وليس HTML). */
  Shr.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  Shr.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  Shr.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- API ---------- */
  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  Shr.ApiError = ApiError;
  Shr.api = async function (path, opts = {}) {
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.json !== undefined) {
      init.body = JSON.stringify(opts.json);
      init.headers['Content-Type'] = 'application/json';
    } else if (opts.form) {
      init.body = opts.form;
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      throw new ApiError('تعذّر الاتصال بالخادم. تأكد أن التطبيق يعمل ثم حاول مجددًا.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* لا شيء */ }
    if (!res.ok) {
      const publicAuth = path === '/api/unlock' || path === '/api/gate/verify';
      if (res.status === 401 && !publicAuth && Shr.onLocked) Shr.onLocked();
      throw new ApiError((data && data.error) || 'حدث خطأ غير متوقع.', res.status);
    }
    return data;
  };

  /* ---------- الأصول والصور الاحتياطية ---------- */
  const svg = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  const face = (sad) => svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 380">
    <defs><radialGradient id="g" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ffe2c8"/><stop offset="1" stop-color="#f3b48c"/></radialGradient></defs>
    <path d="M60 130c0-70 50-105 100-105s100 35 100 105z" fill="#2a1d2e"/>
    <ellipse cx="160" cy="185" rx="106" ry="118" fill="url(#g)" stroke="#2a1d2e" stroke-width="6"/>
    <path d="M62 150c30-40 90-58 196 0-6-60-60-96-98-96S68 90 62 150z" fill="#2a1d2e"/>
    <g fill="#fff" stroke="#2a1d2e" stroke-width="5"><ellipse cx="118" cy="190" rx="24" ry="${sad ? 20 : 26}"/><ellipse cx="202" cy="190" rx="24" ry="${sad ? 20 : 26}"/></g>
    <g fill="#2a1d2e"><circle cx="${sad ? 118 : 122}" cy="${sad ? 198 : 192}" r="10"/><circle cx="${sad ? 202 : 198}" cy="${sad ? 198 : 192}" r="10"/></g>
    ${sad
      ? '<path d="M84 160l44 12M236 160l-44 12" stroke="#2a1d2e" stroke-width="7" stroke-linecap="round"/><path d="M112 222c0 34-2 46-8 60 12-6 16-30 16-60zM208 222c0 34 2 46 8 60-12-6-16-30-16-60z" fill="#7fd0ff" opacity=".85"/><path d="M122 292c24-22 52-22 76 0" fill="none" stroke="#2a1d2e" stroke-width="8" stroke-linecap="round"/>'
      : '<path d="M88 152l44-8M232 152l-44-8" stroke="#2a1d2e" stroke-width="7" stroke-linecap="round"/><path d="M118 270c26 24 58 24 84 0" fill="none" stroke="#2a1d2e" stroke-width="8" stroke-linecap="round"/>'}
    <ellipse cx="86" cy="240" rx="18" ry="11" fill="#ff8fb5" opacity=".55"/><ellipse cx="234" cy="240" rx="18" ry="11" fill="#ff8fb5" opacity=".55"/>
  </svg>`);
  const weArt = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420">
    <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4f9a"/><stop offset="1" stop-color="#4aa8ff"/></linearGradient>
    <radialGradient id="b" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#ff4f9a" stop-opacity=".35"/><stop offset="1" stop-color="#07060d" stop-opacity="0"/></radialGradient></defs>
    <rect width="640" height="420" fill="#0d0a1a"/><rect width="640" height="420" fill="url(#b)"/>
    <g fill="none" stroke="url(#a)" stroke-width="5" stroke-linecap="round">
      <path d="M270 300c-70-46-104-88-104-134 0-32 24-56 52-56 24 0 42 14 52 36"/>
      <path d="M370 300c70-46 104-88 104-134 0-32-24-56-52-56-24 0-42 14-52 36"/>
    </g>
    <text x="320" y="368" text-anchor="middle" font-size="26" fill="#a99fc4" font-family="sans-serif">we.png</text></svg>`);
  Shr.fallbacks = { mohammed: face(false), mohammedsad: face(true), we: weArt };

  /** رابط أصل (أو صورته الاحتياطية إن لم يكن موجودًا بعد). */
  Shr.asset = (key) => {
    const a = Shr.state.assets[key];
    return a && a.exists ? a.url : (Shr.fallbacks[key] || null);
  };
  Shr.assetExists = (key) => !!(Shr.state.assets[key] && Shr.state.assets[key].exists);

  /** صورة تعرض احتياطيًا عند الفشل. */
  Shr.img = function (key, cls, alt) {
    const img = Shr.h('img', { class: cls || '', alt: alt || '', decoding: 'async', draggable: 'false' });
    img.src = Shr.asset(key);
    img.addEventListener('error', () => { if (Shr.fallbacks[key] && img.src !== Shr.fallbacks[key]) img.src = Shr.fallbacks[key]; });
    return img;
  };

  /* ---------- التاريخ ---------- */
  Shr.fmtDate = function (iso, withTime = true) {
    try {
      const d = new Date(iso);
      const opts = withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' };
      return new Intl.DateTimeFormat('ar', opts).format(d);
    } catch (e) { return ''; }
  };
  Shr.dayKey = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
  Shr.fmtTime = (iso) => { try { return new Intl.DateTimeFormat('ar', { timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return ''; } };
  Shr.fmtSecs = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- إشعارات ---------- */
  Shr.toast = function (text, kind) {
    const box = Shr.$('#toasts');
    const t = Shr.h('div', { class: 'toast' + (kind ? ' toast--' + kind : ''), role: 'status', text });
    box.append(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 400); }, 3600);
  };

  /* ---------- حالات جاهزة (فارغ/تحميل/خطأ) ---------- */
  Shr.ui = {};
  Shr.ui.loading = (text) => Shr.h('div', { class: 'state state--loading', role: 'status' },
    Shr.h('span', { class: 'spinner', 'aria-hidden': 'true' }), Shr.h('p', { text: text || 'لحظة من فضلك…' }));
  Shr.ui.empty = ({ icon, title, text, action }) => Shr.h('div', { class: 'state state--empty' },
    Shr.h('div', { class: 'state__icon', 'aria-hidden': 'true', text: icon || '✨' }),
    Shr.h('h3', { text: title }), text && Shr.h('p', { text }),
    action && Shr.h('button', { class: 'btn', type: 'button', onclick: action.onClick, text: action.label }));
  Shr.ui.error = (text, onRetry) => Shr.h('div', { class: 'state state--error', role: 'alert' },
    Shr.h('div', { class: 'state__icon', 'aria-hidden': 'true', text: '🥀' }),
    Shr.h('h3', { text: 'تعذّر إكمال ذلك' }), Shr.h('p', { text: text || 'حدث خطأ غير متوقع.' }),
    onRetry && Shr.h('button', { class: 'btn btn--ghost', type: 'button', onclick: onRetry, text: 'حاول مرة أخرى' }));

  Shr.ui.chip = (author) => Shr.h('span', { class: 'chip chip--' + (author.key === 'lara' ? 'l' : 'm'), text: author.name });

  /* ---------- مشغّل الصوت داخل الذكريات ---------- */
  Shr.ui.voice = function (url, seconds) {
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = url;
    const btn = Shr.h('button', { class: 'voice__btn', type: 'button', 'aria-label': 'تشغيل التسجيل الصوتي', text: '▶' });
    const bar = Shr.h('span', { class: 'voice__bar' }, Shr.h('i'));
    const time = Shr.h('span', { class: 'voice__time', text: seconds ? Shr.fmtSecs(seconds) : '' });
    const note = Shr.h('span', { class: 'voice__note', hidden: true, text: 'تعذّر تشغيل التسجيل' });
    const root = Shr.h('div', { class: 'voice' }, btn, bar, time, note);
    let ducked = false;
    const setDuck = (on) => { if (on !== ducked) { ducked = on; Shr.audio && Shr.audio.duck(on); } };
    btn.addEventListener('click', () => { audio.paused ? audio.play().catch(fail) : audio.pause(); });
    audio.addEventListener('play', () => { btn.textContent = '❚❚'; root.classList.add('is-playing'); setDuck(true); });
    audio.addEventListener('pause', () => { btn.textContent = '▶'; root.classList.remove('is-playing'); setDuck(false); });
    audio.addEventListener('ended', () => { bar.firstChild.style.width = '0%'; setDuck(false); });
    audio.addEventListener('timeupdate', () => {
      const total = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds || 0;
      if (total) bar.firstChild.style.width = Math.min(100, (audio.currentTime / total) * 100) + '%';
      time.textContent = Shr.fmtSecs(audio.currentTime) + (total ? ' / ' + Shr.fmtSecs(total) : '');
    });
    function fail() { note.hidden = false; btn.disabled = true; setDuck(false); }
    audio.addEventListener('error', fail);
    root._audio = audio;
    return root;
  };

  /* ---------- انفجار رموز عند نقطة ---------- */
  Shr.burst = function (x, y, chars, count) {
    const layer = document.body;
    for (let i = 0; i < (count || 8); i++) {
      const s = Shr.h('span', { class: 'burst', 'aria-hidden': 'true', text: chars[i % chars.length] });
      const ang = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 90;
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist - 40 + 'px');
      s.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
      layer.append(s);
      setTimeout(() => s.remove(), 1100);
    }
  };

  Shr.reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
})();
