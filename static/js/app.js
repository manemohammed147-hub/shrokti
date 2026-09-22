/* تشغيل التطبيق: القفل → الهوية → التطبيق، التنقل، بوابة الغرفة، وإعادة التشغيل */
(function () {
  'use strict';
  const NAV = [
    { id: 'home', emoji: '🏠', label: 'الرئيسية' },
    { id: 'messages', emoji: '💌', label: 'رسائل' },
    { id: 'memories', emoji: '📖', label: 'الذكريات' },
    { id: 'ai', emoji: '🤖', label: 'محمد AI' },
    { id: 'game', emoji: '🎮', label: 'اضرب محمد' },
    { id: 'sound', emoji: '🔊', label: 'الصوت' },
    { id: 'create', emoji: '✨', label: 'إنشاء ذكريات خاصة' },
  ];
  const PRIMARY = ['home', 'messages', 'memories', 'ai', 'game'];
  const SECONDARY = ['sound', 'create'];
  const VIEW_IDS = NAV.map((n) => n.id);
  let current = null, lockPad = null, gatePad = null, gateOpen = false, vaultLoaded = false;

  const $ = Shr.$;
  const musicFor = (view) => (view === 'memories' ? 'gharam' : 'app');
  Shr.musicForView = () => musicFor(current);

  /* ---------- التنقل ---------- */
  function navItem(n, cls) {
    return Shr.h('button', { class: cls, type: 'button', dataset: { go: n.id }, onclick: () => Shr.go(n.id) },
      Shr.h('span', { class: 'nav-item__e', 'aria-hidden': 'true', text: n.emoji }),
      Shr.h('span', { class: 'nav-item__t', text: n.label }));
  }
  function restartButton(cls) {
    return Shr.h('button', { class: cls, type: 'button', onclick: restart },
      Shr.h('span', { class: 'nav-item__e', 'aria-hidden': 'true', text: '↺' }),
      Shr.h('span', { class: 'nav-item__t', text: 'إعادة تشغيل التطبيق' }));
  }
  function buildNav() {
    const rail = $('#rail'), dock = $('#dock'), items = $('#sheetItems');
    [rail, dock, items].forEach(Shr.clear);
    rail.append(Shr.h('div', { class: 'rail__brand', text: 'شروكتي' }),
      Shr.h('div', { class: 'rail__list' }, NAV.map((n) => navItem(n, 'nav-item'))),
      Shr.h('div', { class: 'rail__foot' }, restartButton('nav-item nav-item--restart')));
    PRIMARY.forEach((id) => dock.append(navItem(NAV.find((n) => n.id === id), 'dock__item')));
    dock.append(Shr.h('button', { class: 'dock__item dock__more', type: 'button', 'aria-haspopup': 'dialog', onclick: () => toggleSheet(true) },
      Shr.h('span', { class: 'nav-item__e', 'aria-hidden': 'true', text: '⋯' }), Shr.h('span', { class: 'nav-item__t', text: 'المزيد' })));
    SECONDARY.forEach((id) => items.append(navItem(NAV.find((n) => n.id === id), 'nav-item nav-item--sheet')));
    items.append(restartButton('nav-item nav-item--sheet nav-item--restart'));
  }
  function toggleSheet(open) {
    const s = $('#sheet');
    s.hidden = !open;
    document.body.classList.toggle('has-sheet', open);
  }

  Shr.go = function (id) {
    if (!VIEW_IDS.includes(id)) id = 'home';
    toggleSheet(false);
    if (current && current !== id && Shr.views[current] && Shr.views[current].leave) Shr.views[current].leave();
    const changed = current !== id;
    current = id;
    Shr.$$('.view').forEach((v) => { v.hidden = v.dataset.view !== id; });
    Shr.$$('[data-go]').forEach((b) => {
      const on = b.dataset.go === id;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const more = $('.dock__more');
    if (more) more.classList.toggle('is-active', SECONDARY.includes(id));
    if (Shr.views[id] && Shr.views[id].enter) Shr.views[id].enter();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    if (changed) window.scrollTo(0, 0);
    if (!$('#app').hidden && !gateOpen) Shr.audio.switchTo(musicFor(id));
    Shr.fx.setMood(id === 'memories' ? 'calm' : 'default');
  };

  /* ---------- الشاشات ---------- */
  function setScreens({ lock, identity, app }) {
    $('#lock').hidden = !lock;
    $('#identity').hidden = !identity;
    $('#app').hidden = !app;
    document.body.classList.toggle('is-locked', !app);
    document.body.classList.toggle('is-app', !!app);
  }

  function showLock(message) {
    closeGate(true); closeVault();
    Shr.$$('.view').forEach((v) => { v.hidden = true; });
    $('#lock').classList.remove('is-leaving');
    setScreens({ lock: true });
    lockPad.reset(); lockPad.activate(true);
    Shr.audio.resetPause();
    Shr.audio.switchTo('lock', { fade: 700 });
    Shr.fx.setMood('default');
    if (message) Shr.toast(message);
    current = null;
  }

  function showIdentity() {
    lockPad.activate(false);
    setScreens({ identity: true });
    $('#identityMsg').textContent = '';
  }

  function setWho(who, name) {
    Shr.state.who = who; Shr.state.whoName = name;
    const pill = $('#whoPill');
    pill.hidden = !who;
    pill.textContent = name || '';
    pill.className = 'who-pill who-pill--' + (who === 'lara' ? 'l' : 'm');
  }

  function showApp(startView) {
    lockPad.activate(false);
    setScreens({ app: true });
    const hash = (location.hash || '').replace('#', '');
    Shr.go(startView || (VIEW_IDS.includes(hash) ? hash : 'home'));
  }

  async function onUnlock(pin) {
    await Shr.api('/api/unlock', { method: 'POST', json: { password: pin } });
    lockPad.activate(false);
    // انتقال سينمائي: نُخفي القفل، ننتقل من louk إلى pack
    $('#lock').classList.add('is-leaving');
    Shr.audio.resetPause();
    Shr.audio.switchTo('app', { fade: 1400 });
    await Shr.sleep(Shr.reducedMotion ? 0 : 650);
    showIdentity();
  }

  async function pickIdentity(who) {
    const msg = $('#identityMsg');
    try {
      await Shr.api('/api/identify', { method: 'POST', json: { who } });
      setWho(who, who === 'lara' ? 'لارا' : 'محمد');
      showApp('home');
    } catch (e) { msg.textContent = e.message; }
  }

  /* ---------- إعادة تشغيل التطبيق (لا تعيد تشغيل الخادم) ---------- */
  async function restart() {
    toggleSheet(false);
    Shr.audio.stopAll();
    closeGate(true); closeVault();
    try { await Shr.api('/api/restart', { method: 'POST' }); } catch (e) { /* الجلسة ستُمسح محليًا على أي حال */ }
    Object.values(Shr.views).forEach((v) => v.reset && v.reset());
    setWho(null, null);
    history.replaceState(null, '', location.pathname);
    showLock();
  }
  Shr.restart = restart;
  Shr.onLocked = () => { if ($('#lock').hidden) showLock('انتهت الجلسة، أدخل الرمز مجددًا.'); };

  /* ---------- بوابة الغرفة ---------- */
  Shr.openGate = function () {
    if (gateOpen || $('#app').hidden) return;
    gateOpen = true;
    const g = $('#gate');
    g.hidden = false; g.classList.remove('is-open'); void g.offsetWidth; g.classList.add('is-in');
    gatePad.reset(); gatePad.activate(true);
    $('#gateClose').focus({ preventScroll: true });
  };
  function closeGate(silent) {
    if (!gateOpen && silent) { $('#gate').hidden = true; return; }
    gateOpen = false;
    const g = $('#gate');
    g.hidden = true; g.classList.remove('is-in', 'is-open');
    if (gatePad) gatePad.activate(false);
  }

  async function onGateSubmit(pin) {
    await Shr.api('/api/gate/verify', { method: 'POST', json: { password: pin } });
    gatePad.activate(false);
    const g = $('#gate');
    g.classList.add('is-open');
    await Shr.sleep(Shr.reducedMotion ? 0 : 900);
    try {
      await loadVault();
      closeGate(true);
      Shr.vault.open();
    } catch (e) {
      closeGate(true);
      Shr.toast('تعذّر فتح المكان. حاول مجددًا.', 'error');
    }
  }

  function loadVault() {
    if (vaultLoaded && window.Shr.vault) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/hidden-room.css';
      document.head.append(css);
      const s = document.createElement('script');
      s.src = '/hidden-room.js';
      s.onload = () => { vaultLoaded = true; resolve(); };
      s.onerror = () => { css.remove(); reject(new Error('load')); };
      document.body.append(s);
    });
  }
  function closeVault() { if (window.Shr.vault && window.Shr.vault.isOpen && window.Shr.vault.isOpen()) window.Shr.vault.close(true); }

  /* ---------- الإقلاع ---------- */
  async function boot() {
    const [assets, sess] = await Promise.all([
      Shr.api('/api/assets/status').catch(() => ({})),
      Shr.api('/api/session').catch(() => ({ unlocked: false })),
    ]);
    Shr.state.assets = assets;
    Shr.audio.init(assets);
    Shr.views.home.refreshArt && Shr.views.home.refreshArt();
    buildNav();

    lockPad = Shr.pinPad($('#lockPin'), { length: 4, onSubmit: onUnlock });
    gatePad = Shr.pinPad($('#gatePin'), { length: 4, onSubmit: onGateSubmit });

    Shr.$$('[data-who]').forEach((b) => b.addEventListener('click', () => pickIdentity(b.dataset.who)));
    $('#restartTop').addEventListener('click', restart);
    $('#sheet').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) toggleSheet(false); });
    $('#gateClose').addEventListener('click', () => closeGate());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (gateOpen) closeGate();
      else if (!$('#sheet').hidden) toggleSheet(false);
    });
    window.addEventListener('hashchange', () => {
      const id = (location.hash || '').replace('#', '');
      if (!$('#app').hidden && VIEW_IDS.includes(id) && id !== current) Shr.go(id);
    });

    if (sess.unlocked && sess.who) { setWho(sess.who, sess.who_name); showApp(); }
    else if (sess.unlocked) { setScreens({ identity: true }); }
    else showLock();
    document.body.classList.add('is-ready');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
