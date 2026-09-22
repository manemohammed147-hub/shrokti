/* الغرفة المخفية — يُقدَّم هذا الملف من الخادم فقط بعد التحقق من الرمز السري (لا يوجد في static). */
(function () {
  'use strict';
  const $ = Shr.$, h = Shr.h;
  let root = null, opened = false, slides = [], active = 0;
  let tab = 'memories', built = false, ref = {};

  const V = (Shr.vault = {
    isOpen: () => opened,
    open,
    close,
  });

  /* ---------- الهيكل ---------- */
  function build() {
    built = true;
    root = $('#vault');
    ref.count = h('span', { class: 'vault__count', 'aria-live': 'polite' });
    ref.tabMem = h('button', { class: 'vtab is-on', type: 'button', role: 'tab', 'aria-selected': 'true', onclick: () => setTab('memories') }, 'الذكريات');
    ref.badge = h('span', { class: 'vtab__badge', hidden: true });
    ref.tabQ = h('button', { class: 'vtab', type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => setTab('questions') }, 'أسئلة تنتظر جوابًا ', ref.badge);
    ref.reel = h('div', { class: 'reel', tabindex: '0', 'aria-label': 'شريط الذكريات' });
    ref.prev = h('button', { class: 'reel__nav reel__nav--prev', type: 'button', 'aria-label': 'السابقة', onclick: () => go(active - 1) }, '›');
    ref.next = h('button', { class: 'reel__nav reel__nav--next', type: 'button', 'aria-label': 'التالية', onclick: () => go(active + 1) }, '‹');
    ref.line = h('i');
    ref.memSection = h('section', { class: 'vault__mem' },
      h('div', { class: 'reel-wrap' }, ref.prev, ref.reel, ref.next),
      h('div', { class: 'reel__meta' }, h('div', { class: 'reel__line' }, ref.line), ref.count));
    ref.qSection = h('section', { class: 'vault__q', hidden: true });
    ref.close = h('button', { class: 'vault__close', type: 'button', onclick: () => close() }, h('span', { 'aria-hidden': 'true' }, '←'), ' الخروج');
    Shr.clear(root);
    root.append(
      h('div', { class: 'vault__beam vault__beam--a', 'aria-hidden': 'true' }),
      h('div', { class: 'vault__beam vault__beam--b', 'aria-hidden': 'true' }),
      h('header', { class: 'vault__top' },
        h('div', { class: 'vault__titles' },
          h('h2', { class: 'vault__title' }, 'الغرفة'),
          h('p', { class: 'vault__sub' }, 'كل ذكرى تُحفظ تصل إلى هنا وحدها.')),
        ref.close),
      h('div', { class: 'vtabs', role: 'tablist' }, ref.tabMem, ref.tabQ),
      ref.memSection, ref.qSection);
    ref.reel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(active + 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(active - 1); }
    });
    document.addEventListener('keydown', (e) => { if (opened && e.key === 'Escape') close(); });
  }

  function open() {
    if (!built) build();
    opened = true;
    root.hidden = false;
    document.body.classList.add('in-vault');
    Shr.fx.setMood('vault');
    Shr.audio.switchTo('gharam');       // موسيقى غرام
    setTab('memories');
    loadMemories();
    loadQuestions(true);
    ref.close.focus({ preventScroll: true });
  }

  async function close(silent) {
    if (!opened) return;
    opened = false;
    root.hidden = true;
    document.body.classList.remove('in-vault');
    Shr.fx.setMood('default');
    // نُنهي صلاحية الغرفة في الخادم: العودة تتطلب الكلمة والرمز من جديد
    try { await Shr.api('/api/hidden/close', { method: 'POST' }); } catch (e) { /* الجلسة قد تكون انتهت */ }
    if (!silent) Shr.audio.switchTo(Shr.musicForView());
  }

  function setTab(name) {
    tab = name;
    ref.tabMem.classList.toggle('is-on', name === 'memories');
    ref.tabQ.classList.toggle('is-on', name === 'questions');
    ref.tabMem.setAttribute('aria-selected', String(name === 'memories'));
    ref.tabQ.setAttribute('aria-selected', String(name === 'questions'));
    ref.memSection.hidden = name !== 'memories';
    ref.qSection.hidden = name !== 'questions';
    if (name === 'questions') loadQuestions(false);
  }

  /* ---------- الذكريات ---------- */
  async function loadMemories() {
    Shr.clear(ref.reel); slides = []; ref.count.textContent = '';
    ref.reel.append(h('div', { class: 'vstate' }, Shr.ui.loading('نفتح الغرفة…')));
    try {
      const data = await Shr.api('/api/hidden/memories');
      Shr.clear(ref.reel);
      slides = [cover(data.items.length)];
      data.items.forEach((m) => slides.push(memorySlide(m)));
      if (!data.items.length) slides.push(h('article', { class: 'slide slide--empty' }, Shr.ui.empty({ icon: '🕯️', title: 'الغرفة ما زالت فارغة', text: 'أول ذكرى تُكتب ستظهر هنا فور حفظها.' })));
      slides.forEach((s) => ref.reel.append(s));
      observe();
      // نبدأ بأحدث ذكرى إن وُجدت، وإلا بالغلاف
      const start = data.items.length ? slides.length - 1 : 0;
      requestAnimationFrame(() => { go(start, true); });
    } catch (e) {
      Shr.clear(ref.reel);
      if (e.status === 403 || e.status === 401) { ref.reel.append(h('div', { class: 'vstate' }, Shr.ui.error('انتهت صلاحية الدخول. أعد المحاولة من البداية.', () => close()))); }
      else ref.reel.append(h('div', { class: 'vstate' }, Shr.ui.error(e.message, loadMemories)));
    }
  }

  function cover(n) {
    return h('article', { class: 'slide slide--cover' },
      h('div', { class: 'cover__frame' }, Shr.img('we', 'cover__img', 'محمد ولارا'), h('span', { class: 'cover__leak', 'aria-hidden': 'true' })),
      h('h3', { class: 'cover__title' }, 'لنا'),
      h('p', { class: 'cover__text' }, n ? (n === 1 ? 'ذكرى واحدة تنتظرك.' : n + ' ذكريات تنتظرك.') : 'لا ذكريات بعد.'),
      n ? h('p', { class: 'cover__hint' }, 'اسحب لترى الذكريات') : null);
  }

  function memorySlide(m) {
    const long = (m.body || '').length > 220;
    let media = null;
    if (m.image_url) {
      media = h('figure', { class: 'slide__img' }, h('img', { src: m.image_url, alt: 'صورة من الذكرى', loading: 'lazy', decoding: 'async' }));
      media.firstChild.addEventListener('error', () => media.replaceWith(h('div', { class: 'mem__missing' }, 'تعذّر عرض الصورة')));
    } else if (m.image_missing) media = h('div', { class: 'mem__missing' }, 'الصورة غير متوفرة حاليًا');
    const voice = m.audio_url ? Shr.ui.voice(m.audio_url, m.audio_seconds) : m.audio_missing ? h('div', { class: 'mem__missing' }, 'التسجيل الصوتي غير متوفر حاليًا') : null;
    return h('article', { class: 'slide slide--memory slide--' + (m.author.key === 'lara' ? 'l' : 'm'), dataset: { id: m.id } },
      media,
      h('div', { class: 'slide__body' },
        h('header', { class: 'slide__head' }, Shr.ui.chip(m.author), h('time', { datetime: m.created_at }, Shr.fmtDate(m.created_at))),
        m.body ? h('p', { class: 'slide__text' + (long ? ' is-long' : '') }, m.body) : null,
        voice));
  }

  let ticking = false;
  function pickActive() {
    ticking = false;
    if (!slides.length || !opened) return;
    const rc = ref.reel.getBoundingClientRect();
    const cx = rc.left + rc.width / 2;
    let best = 0, dist = Infinity;
    slides.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - cx);
      if (d < dist) { dist = d; best = i; }
    });
    slides.forEach((s, i) => s.classList.toggle('is-active', i === best));
    if (best !== active) { active = best; }
    paintMeta();
  }
  function observe() {
    if (!ref.scrollBound) {
      ref.scrollBound = true;
      ref.reel.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(pickActive); } }, { passive: true });
      window.addEventListener('resize', () => requestAnimationFrame(pickActive));
    }
    requestAnimationFrame(pickActive);
  }
  function paintMeta() {
    const total = slides.length - 1;
    ref.count.textContent = active === 0 ? 'الغلاف' : active + ' / ' + total;
    ref.line.style.width = (slides.length > 1 ? (active / (slides.length - 1)) * 100 : 0) + '%';
    ref.prev.disabled = active <= 0; ref.next.disabled = active >= slides.length - 1;
  }
  function go(i, instant) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (!slides[i]) return;
    slides[i].scrollIntoView({ behavior: instant || Shr.reducedMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    active = i; slides.forEach((x, k) => x.classList.toggle('is-active', k === i)); paintMeta();
  }

  /* ---------- الأسئلة التي لم يعرف محمد AI جوابها ---------- */
  async function loadQuestions(silent) {
    if (!silent) { Shr.clear(ref.qSection); ref.qSection.append(Shr.ui.loading('نجمع الأسئلة…')); }
    try {
      const data = await Shr.api('/api/hidden/questions');
      const open = data.items.filter((q) => q.status === 'open').length;
      ref.badge.hidden = !open; ref.badge.textContent = String(open);
      if (silent) return;
      Shr.clear(ref.qSection);
      ref.qSection.append(h('p', { class: 'q-intro' }, 'هذه أسئلة لم يجد محمد AI جوابًا لها. اكتب الجواب هنا، وسيستعمله لاحقًا.'));
      if (!data.items.length) {
        ref.qSection.append(Shr.ui.empty({ icon: '🌙', title: 'لا أسئلة معلّقة', text: 'كل ما سُئل عنه كان له جواب.' }));
        return;
      }
      data.items.forEach((q) => ref.qSection.append(qCard(q)));
    } catch (e) {
      if (!silent) { Shr.clear(ref.qSection); ref.qSection.append(Shr.ui.error(e.message, () => loadQuestions(false))); }
    }
  }

  function qCard(q) {
    const card = h('article', { class: 'qcard' + (q.status === 'answered' ? ' is-answered' : ''), dataset: { id: q.id } });
    const render = (data) => {
      Shr.clear(card);
      card.classList.toggle('is-answered', data.status === 'answered');
      card.append(
        h('header', { class: 'qcard__head' },
          h('span', { class: 'chip ' + (data.asker === 'لارا' ? 'chip--l' : 'chip--m') }, data.asker),
          h('span', { class: 'pill ' + (data.status === 'answered' ? 'pill--on' : 'pill--warn') }, data.status === 'answered' ? 'تمت الإجابة' : 'بلا جواب'),
          data.times_asked > 1 ? h('span', { class: 'qcard__times' }, 'سُئل ' + data.times_asked + ' مرات') : null,
          h('time', { class: 'qcard__time' }, Shr.fmtDate(data.last_asked_at))),
        h('p', { class: 'qcard__q' }, data.question));
      if (data.status === 'answered') {
        card.append(h('p', { class: 'qcard__a' }, data.answer),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editor(data) }, 'تعديل الجواب'));
      } else editor(data, true);
    };
    function editor(data, initial) {
      Shr.$$('.qform', card).forEach((f) => f.remove());
      const ta = h('textarea', { class: 'field__input field__input--area', rows: '3', maxlength: '1000', placeholder: 'اكتب الجواب…', 'aria-label': 'الجواب' });
      ta.value = data.answer || '';
      const msg = h('p', { class: 'form-msg', role: 'alert' });
      const btn = h('button', { class: 'btn btn--sm', type: 'submit' }, 'حفظ الجواب');
      const form = h('form', { class: 'qform', novalidate: true }, ta, msg, btn);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const answer = ta.value.trim();
        if (!answer) { msg.textContent = 'اكتب الجواب أولًا.'; return; }
        btn.disabled = true;
        try {
          const saved = await Shr.api('/api/hidden/questions/' + data.id + '/answer', { method: 'POST', json: { answer } });
          render(saved); loadQuestions(true);
        } catch (e) { msg.textContent = e.message; btn.disabled = false; }
      });
      card.append(form);
      if (!initial) ta.focus();
    }
    render(q);
    return card;
  }
})();
