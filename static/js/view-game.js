/* 🎮 اضرب محمد — لعبة كرتونية: مستويات، كومبو، تحديات، أشكال قفازات تُفتح، وتقدّم محفوظ في الخادم */
(function () {
  'use strict';
  const OUCH = ['آخ!', 'أوف!', 'لا لا لا!', 'حرام عليك!', 'يا ويلي!', 'بس بس!', 'دوخت 😵', 'هيك بتعامل صاحبك؟'];
  const COMBO_GAP = 900;
  let built = false, root, cfg = null, progress = null, skins = [];
  let ui = {};
  const G = { mode: 'menu', level: null, cfg: null, score: 0, hits: 0, combo: 0, best: 0, timeLeft: 0, lastHit: 0, timer: null, startAt: 0, running: false, ended: false, ouchAt: 0 };

  const setMode = (m) => { G.mode = m; if (root) root.classList.toggle('is-playing', m === 'play'); };
  const skinNow = () => skins.find((s) => s.id === (progress && progress.skin)) || skins[0] || { emojis: ['🥊', '💥', '⭐'] };
  const mult = () => Math.min(1 + Math.floor(G.combo / 5), 5);

  /* ---------- بناء الواجهة ---------- */
  function build() {
    built = true;
    root = Shr.$('#view-game');
    ui.menu = Shr.h('section', { class: 'game-menu' });
    ui.score = Shr.h('strong', { text: '0' });
    ui.combo = Shr.h('strong', { text: '0' });
    ui.comboMult = Shr.h('em', { class: 'hud__mult', text: '' });
    ui.time = Shr.h('strong', { text: '0' });
    ui.level = Shr.h('strong', { text: '1' });
    ui.bar = Shr.h('i');
    ui.hits = Shr.h('span', { class: 'game__hits', text: '' });
    ui.challenge = Shr.h('p', { class: 'game__challenge' });
    ui.fx = Shr.h('div', { class: 'arena__fx', 'aria-hidden': 'true' });
    ui.img = Shr.img('mohammed', 'muh__img', 'محمد');
    ui.muh = Shr.h('button', { class: 'muh', type: 'button', 'aria-label': 'اضرب محمد' }, ui.img);
    ui.track = Shr.h('div', { class: 'muh-track' }, ui.muh);
    ui.count = Shr.h('div', { class: 'arena__count', hidden: true });
    ui.arena = Shr.h('div', { class: 'arena' }, ui.track, ui.fx, ui.count);
    ui.play = Shr.h('section', { class: 'game-play', hidden: true },
      Shr.h('div', { class: 'hud' },
        Shr.h('div', { class: 'hud__item' }, Shr.h('span', { text: 'المستوى' }), ui.level),
        Shr.h('div', { class: 'hud__item' }, Shr.h('span', { text: 'النقاط' }), ui.score),
        Shr.h('div', { class: 'hud__item hud__item--combo' }, Shr.h('span', { text: 'كومبو' }), Shr.h('div', {}, ui.combo, ui.comboMult)),
        Shr.h('div', { class: 'hud__item' }, Shr.h('span', { text: 'الوقت' }), ui.time)),
      Shr.h('div', { class: 'game__progress', role: 'progressbar', 'aria-label': 'تقدّم المستوى' }, ui.bar),
      Shr.h('div', { class: 'game__meta' }, ui.challenge, ui.hits),
      ui.arena,
      Shr.h('button', { class: 'btn btn--ghost game__quit', type: 'button', text: 'العودة للمستويات', onclick: () => { stopGame(); showMenu(); } }));
    ui.result = Shr.h('section', { class: 'game-result glass glass--edge', hidden: true });
    root.append(
      Shr.h('header', { class: 'view-head' },
        Shr.h('h2', { class: 'view-head__title', text: 'اضرب محمد' }),
        Shr.h('p', { class: 'view-head__sub', text: 'لعبة كرتونية للضحك فقط: اضغط على محمد قبل انتهاء الوقت.' })),
      ui.menu, ui.play, ui.result);

    ui.muh.addEventListener('pointerdown', onHit);
    ui.muh.addEventListener('click', (e) => { if (e.detail === 0) onHit(e); }); // لوحة المفاتيح
    ui.muh.addEventListener('contextmenu', (e) => e.preventDefault());
    new Image().src = Shr.asset('mohammedsad');
  }

  /* ---------- القائمة ---------- */
  async function showMenu() {
    setMode('menu');
    ui.play.hidden = true; ui.result.hidden = true; ui.menu.hidden = false;
    Shr.clear(ui.menu);
    if (!cfg) {
      ui.menu.append(Shr.ui.loading('نجهّز الحلبة…'));
      try {
        const data = await Shr.api('/api/game/progress');
        cfg = data.levels; skins = data.skins; progress = data.progress;
      } catch (e) {
        Shr.clear(ui.menu); ui.menu.append(Shr.ui.error(e.message, showMenu)); return;
      }
      Shr.clear(ui.menu);
    }
    renderMenu();
  }

  function renderMenu() {
    Shr.clear(ui.menu);
    const grid = Shr.h('div', { class: 'level-grid' });
    cfg.forEach((lv) => {
      const locked = lv.level > progress.max_level;
      const stars = progress.stars[String(lv.level)] || 0;
      grid.append(Shr.h('button', {
        class: 'lvl' + (locked ? ' is-locked' : '') + (stars ? ' is-done' : ''), type: 'button', disabled: locked,
        'aria-label': locked ? `المستوى ${lv.level} مقفل` : `المستوى ${lv.level}`,
        dataset: { level: lv.level }, onclick: () => startLevel(lv.level),
      }, Shr.h('span', { class: 'lvl__n', text: locked ? '🔒' : String(lv.level) }),
        Shr.h('span', { class: 'lvl__stars', 'aria-hidden': 'true', text: locked ? '' : '★'.repeat(stars) + '☆'.repeat(3 - stars) })));
    });
    const skinRow = Shr.h('div', { class: 'skin-row' });
    skins.forEach((s) => {
      const ok = progress.unlocked_skins.includes(s.id);
      skinRow.append(Shr.h('button', {
        class: 'skin' + (progress.skin === s.id ? ' is-on' : ''), type: 'button', disabled: !ok, dataset: { skin: s.id },
        title: ok ? s.name : `يُفتح بإكمال المستوى ${s.unlock_level}`,
        onclick: () => pickSkin(s.id),
      }, Shr.h('span', { class: 'skin__e', 'aria-hidden': 'true', text: ok ? s.emojis[0] : '🔒' }),
        Shr.h('span', { class: 'skin__n', text: ok ? s.name : `المستوى ${s.unlock_level}` })));
    });
    const stat = (label, val) => Shr.h('div', { class: 'stat' }, Shr.h('strong', { text: String(val) }), Shr.h('span', { text: label }));
    ui.menu.append(
      Shr.h('div', { class: 'menu-card glass' },
        Shr.h('h3', { class: 'menu-card__title', text: 'اختر مستوى' }), grid),
      Shr.h('div', { class: 'menu-card glass' },
        Shr.h('h3', { class: 'menu-card__title', text: 'شكل الضربات' }), skinRow),
      Shr.h('div', { class: 'stats' },
        stat('أعلى نقاط', progress.best_score), stat('أفضل كومبو', progress.best_combo),
        stat('إجمالي الضربات', progress.total_hits), stat('مرات اللعب', progress.plays),
        stat('تحديات منجزة', progress.challenges.length)));
  }

  async function pickSkin(id) {
    try {
      await Shr.api('/api/game/skin', { method: 'POST', json: { skin: id } });
      progress.skin = id; renderMenu();
    } catch (e) { Shr.toast(e.message, 'error'); }
  }

  /* ---------- اللعب ---------- */
  function paint() {
    ui.score.textContent = String(G.score);
    ui.combo.textContent = String(G.combo);
    ui.comboMult.textContent = G.combo >= 5 ? '×' + mult() : '';
    ui.time.textContent = Math.ceil(G.timeLeft) + 'ث';
    ui.bar.style.width = Math.min(100, (G.hits / G.cfg.target) * 100) + '%';
    ui.hits.textContent = `${Math.min(G.hits, G.cfg.target)} / ${G.cfg.target}`;
    ui.time.parentElement.classList.toggle('is-low', G.timeLeft <= 5 && G.running);
  }

  async function startLevel(n) {
    stopGame();
    const lv = cfg[n - 1];
    lv.challenge.done = false;
    setMode('play');
    Object.assign(G, { level: n, cfg: lv, score: 0, hits: 0, combo: 0, best: 0, timeLeft: lv.seconds, lastHit: 0, running: false, ended: false });
    ui.menu.hidden = true; ui.result.hidden = true; ui.play.hidden = false;
    ui.level.textContent = String(n);
    ui.challenge.textContent = '🎯 ' + lv.challenge.text;
    ui.challenge.classList.remove('is-done');
    ui.img.src = Shr.asset('mohammed');
    ui.arena.classList.remove('is-sad', 'is-win');
    ui.track.dataset.move = String(lv.move);
    ui.track.style.transform = '';
    Shr.clear(ui.fx);
    paint();
    // عدّ تنازلي قصير
    ui.count.hidden = false;
    for (const t of ['٣', '٢', '١', 'اضرب!']) {
      if (G.mode !== 'play' || G.level !== n) return;
      ui.count.textContent = t; ui.count.classList.remove('pop'); void ui.count.offsetWidth; ui.count.classList.add('pop');
      await Shr.sleep(t === 'اضرب!' ? 450 : 620);
    }
    if (G.mode !== 'play' || G.level !== n) return;
    ui.count.hidden = true;
    G.running = true; G.startAt = performance.now();
    G.timer = setInterval(tick, 100);
  }

  function tick() {
    if (!G.running) return;
    G.timeLeft = Math.max(0, G.cfg.seconds - (performance.now() - G.startAt) / 1000);
    if (G.combo && performance.now() - G.lastHit > COMBO_GAP) G.combo = 0;
    paint();
    if (G.timeLeft <= 0) finish(false);
  }

  function stopGame() {
    clearInterval(G.timer); G.timer = null; G.running = false;
  }

  function onHit(ev) {
    if (!G.running || G.ended) return;
    if (ev.cancelable) ev.preventDefault();
    const now = performance.now();
    G.combo = now - G.lastHit <= COMBO_GAP && G.combo > 0 ? G.combo + 1 : 1;
    G.lastHit = now;
    G.best = Math.max(G.best, G.combo);
    G.hits += 1;
    const gain = 10 * mult();
    G.score += gain;

    const rect = ui.arena.getBoundingClientRect();
    let x = rect.width / 2, y = rect.height / 2;
    if (ev.clientX !== undefined && (ev.clientX || ev.clientY)) { x = ev.clientX - rect.left; y = ev.clientY - rect.top; }
    spawnFx(x, y, gain);
    shake();
    if (G.cfg.move === 3) dodge();
    if (now - G.ouchAt > 1400 && Math.random() < 0.35) ouch(x, y);

    if (!G.cfg.challenge.done && challengeMet()) { G.cfg.challenge.done = true; ui.challenge.classList.add('is-done'); }
    paint();
    if (G.hits >= G.cfg.target) finish(true);
  }

  function challengeMet() {
    const c = G.cfg.challenge;
    if (c.type === 'combo') return G.best >= c.value;
    if (c.type === 'score') return G.score >= c.value;
    return false; // «السرعة» تُقيَّم عند النهاية
  }

  function spawnFx(x, y, gain) {
    const set = skinNow().emojis;
    for (let i = 0; i < 4; i++) {
      const s = Shr.h('span', { class: 'hitfx', text: set[i % set.length] });
      const ang = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * d + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * d - 20 + 'px');
      s.style.setProperty('--r', Math.round(Math.random() * 80 - 40) + 'deg');
      ui.fx.append(s); setTimeout(() => s.remove(), 750);
    }
    const p = Shr.h('span', { class: 'popfx' + (G.combo >= 5 ? ' is-big' : ''), text: '+' + gain });
    p.style.left = x + 'px'; p.style.top = y + 'px';
    ui.fx.append(p); setTimeout(() => p.remove(), 800);
    while (ui.fx.children.length > 40) ui.fx.firstChild.remove();
  }

  function shake() {
    if (Shr.reducedMotion || !ui.img.animate) return;
    ui.img.animate([
      { transform: 'translate(0,0) rotate(0) scale(1)' },
      { transform: 'translate(-10px,3px) rotate(-6deg) scale(.94,1.04)' },
      { transform: 'translate(9px,-2px) rotate(5deg) scale(1.04,.96)' },
      { transform: 'translate(-4px,1px) rotate(-2deg)' },
      { transform: 'translate(0,0) rotate(0) scale(1)' },
    ], { duration: 230, easing: 'ease-out' });
  }

  function dodge() {
    const room = Math.max(0, ui.arena.clientWidth / 2 - ui.muh.offsetWidth / 2 - 6);
    ui.track.style.transform = `translateX(${(Math.random() * 2 - 1) * room}px)`;
  }

  function ouch(x, y) {
    G.ouchAt = performance.now();
    const b = Shr.h('span', { class: 'ouch', text: OUCH[Math.floor(Math.random() * OUCH.length)] });
    b.style.left = Math.min(Math.max(x, 70), ui.arena.clientWidth - 70) + 'px';
    b.style.top = Math.max(y - 46, 18) + 'px';
    ui.fx.append(b); setTimeout(() => b.remove(), 900);
  }

  /* ---------- النهاية ---------- */
  async function finish(won) {
    if (G.ended) return;
    G.ended = true; stopGame(); paint();
    const timeLeft = won ? G.timeLeft : 0;
    if (won) {
      ui.img.src = Shr.asset('mohammedsad'); // الصورة الحزينة عند اكتمال الشريط
      ui.arena.classList.add('is-sad', 'is-win');
      ['💦', '😢', '💫', '💦'].forEach((e, i) => setTimeout(() => {
        const r = ui.arena.getBoundingClientRect();
        const s = Shr.h('span', { class: 'hitfx', text: e });
        s.style.left = r.width / 2 + (i - 1.5) * 44 + 'px'; s.style.top = r.height * 0.3 + 'px';
        s.style.setProperty('--dx', (i - 1.5) * 26 + 'px'); s.style.setProperty('--dy', '-50px'); s.style.setProperty('--r', '0deg');
        ui.fx.append(s); setTimeout(() => s.remove(), 750);
      }, i * 120));
    }
    let res = null;
    try {
      res = await Shr.api('/api/game/result', {
        method: 'POST',
        json: { level: G.level, won, score: G.score, hits: G.hits, best_combo: G.best, time_left: Math.round(timeLeft * 10) / 10 },
      });
      progress = res.progress;
    } catch (e) {
      Shr.toast('تعذّر حفظ التقدّم: ' + e.message, 'error');
    }
    await Shr.sleep(won ? 1100 : 250);
    if (G.mode !== 'play') return;
    showResult(won, res);
  }

  function showResult(won, res) {
    setMode('result');
    ui.play.hidden = true; ui.result.hidden = false;
    Shr.clear(ui.result);
    const stars = res ? res.stars : 0;
    const nextOk = won && G.level < cfg.length;
    const stat = (label, val) => Shr.h('div', { class: 'stat' }, Shr.h('strong', { text: String(val) }), Shr.h('span', { text: label }));
    const challengeDone = res ? res.challenge_done : false;
    ui.result.append(
      Shr.h('div', { class: 'result__face' }, (() => { const i = Shr.img(won ? 'mohammedsad' : 'mohammed', 'result__img', ''); return i; })()),
      Shr.h('h3', { class: 'result__title', text: won ? 'محمد زعلان! 😢' : 'انتهى الوقت ⏱️' }),
      Shr.h('p', { class: 'result__sub', text: won ? `أنجزت المستوى ${G.level} بنجاح.` : 'محمد ما زعل بعد… جرّب مرة ثانية 😏' }),
      Shr.h('div', { class: 'result__stars', 'aria-label': `${stars} من 3 نجوم`, text: '★'.repeat(stars) + '☆'.repeat(3 - stars) }),
      Shr.h('div', { class: 'stats stats--result' },
        stat('النقاط', G.score), stat('أفضل كومبو', G.best), stat('الضربات', `${G.hits}/${G.cfg.target}`)),
      Shr.h('p', { class: 'result__challenge' + (challengeDone ? ' is-done' : ''), text: (challengeDone ? '✅ ' : '⬜ ') + G.cfg.challenge.text }),
      res && res.new_skins && res.new_skins.length
        ? Shr.h('p', { class: 'result__unlock', text: '🎁 فتحت شكلًا جديدًا للضربات: ' + res.new_skins.map((id) => (skins.find((s) => s.id === id) || {}).name).join('، ') })
        : null,
      Shr.h('div', { class: 'result__actions' },
        nextOk && Shr.h('button', { class: 'btn', type: 'button', dataset: { act: 'next' }, text: 'المستوى التالي', onclick: () => startLevel(G.level + 1) }),
        Shr.h('button', { class: 'btn' + (nextOk ? ' btn--ghost' : ''), type: 'button', dataset: { act: 'retry' }, text: 'إعادة المحاولة', onclick: () => startLevel(G.level) }),
        Shr.h('button', { class: 'btn btn--ghost', type: 'button', dataset: { act: 'menu' }, text: 'المستويات', onclick: () => showMenu() })));
    if (won) Shr.burst(innerWidth / 2, innerHeight * 0.3, ['⭐', '✨', '💗', '🥊'], 12);
  }

  Shr.views.game = {
    enter() { if (!built) build(); if (G.mode === 'menu' || !G.mode) showMenu(); },
    leave() { if (built) { stopGame(); if (G.mode === 'play') showMenu(); } },
    reset() { stopGame(); built = false; cfg = null; progress = null; G.mode = 'menu'; root = null; Shr.clear(Shr.$('#view-game')); },
    _state: G,
  };
})();
