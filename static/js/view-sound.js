/* 🔊 الصوت: تحكم بالمستوى والتشغيل، وحالة كل سياق موسيقي */
(function () {
  'use strict';
  let built = false, unsub = null, ref = {};
  const ORDER = [
    ['lock', 'شاشة الدخول', 'تُسمع قبل إدخال الرمز.'],
    ['app', 'التطبيق', 'الموسيقى الأساسية أثناء التنقل بين الأقسام.'],
    ['gharam', 'غرام', 'تنساب داخل الذكريات وحدها.'],
  ];

  function build() {
    built = true;
    const A = Shr.audio;
    const root = Shr.$('#view-sound');
    ref.eq = Shr.h('div', { class: 'eq', 'aria-hidden': 'true' }, Array.from({ length: 5 }, () => Shr.h('i')));
    ref.now = Shr.h('h3', { class: 'sound-now__title', text: '' });
    ref.sub = Shr.h('p', { class: 'sound-now__sub', text: '' });
    ref.play = Shr.h('button', { class: 'btn', type: 'button', text: 'إيقاف مؤقت', onclick: () => A.togglePlay() });
    ref.mute = Shr.h('button', { class: 'btn btn--ghost', type: 'button', text: 'كتم', onclick: () => A.toggleMute() });
    ref.vol = Shr.h('input', { class: 'range', type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'مستوى الصوت' });
    ref.volVal = Shr.h('output', { class: 'sound-vol__val', text: '' });
    ref.vol.addEventListener('input', () => A.setVolume(ref.vol.value / 100));
    ref.cards = {};
    const cards = Shr.h('div', { class: 'sound-cards' });
    ORDER.forEach(([id, title, desc]) => {
      const L = A.labels[id];
      const pill = Shr.h('span', { class: 'pill', text: '' });
      const path = Shr.h('code', { class: 'sound-card__file', dir: 'ltr', text: L.path });
      const card = Shr.h('article', { class: 'sound-card', dataset: { ctx: id } },
        Shr.h('header', {}, Shr.h('h4', { text: title }), pill), Shr.h('p', { text: desc }), path);
      ref.cards[id] = { card, pill };
      cards.append(card);
    });
    ref.empty = Shr.h('div', { class: 'sound-empty', hidden: true },
      Shr.h('p', { text: 'لم تُضَف ملفات الموسيقى بعد. ضع الملفات في المجلدات الموضّحة أدناه ثم أعد تحميل الصفحة.' }));
    root.append(
      Shr.h('header', { class: 'view-head' },
        Shr.h('h2', { class: 'view-head__title', text: 'الصوت' }),
        Shr.h('p', { class: 'view-head__sub', text: 'موسيقى فقط، بلا أي مؤثرات صوتية.' })),
      Shr.h('section', { class: 'sound-now glass glass--edge' },
        ref.eq, Shr.h('div', { class: 'sound-now__txt' }, ref.now, ref.sub),
        Shr.h('div', { class: 'sound-now__btns' }, ref.play, ref.mute),
        Shr.h('label', { class: 'sound-vol' }, Shr.h('span', { text: 'مستوى الصوت' }), ref.vol, ref.volVal)),
      ref.empty, cards);
  }

  function paint(s) {
    const A = Shr.audio;
    const cur = s.current && A.labels[s.current];
    const anyFile = Object.values(s.tracks).some((t) => t.exists);
    ref.empty.hidden = anyFile;
    ref.eq.classList.toggle('is-on', s.playing && !s.muted);
    if (!cur) { ref.now.textContent = 'لا موسيقى حاليًا'; ref.sub.textContent = ''; }
    else {
      ref.now.textContent = 'الآن: ' + cur.title;
      ref.sub.textContent = !s.exists ? `الملف ${cur.file} غير موجود بعد.`
        : s.playing ? `يعمل: ${cur.file}` : s.pending ? 'اضغط لبدء الموسيقى (المتصفح منع التشغيل التلقائي).' : `متوقف مؤقتًا: ${cur.file}`;
    }
    ref.play.textContent = s.playing ? 'إيقاف مؤقت' : 'تشغيل';
    ref.play.disabled = !s.exists;
    ref.mute.textContent = s.muted ? 'إلغاء الكتم' : 'كتم';
    ref.vol.value = Math.round(s.master * 100);
    ref.volVal.textContent = Math.round(s.master * 100) + '٪';
    Object.entries(ref.cards).forEach(([id, c]) => {
      const t = s.tracks[id] || { exists: false, playing: false };
      c.card.classList.toggle('is-current', s.current === id);
      c.pill.textContent = !t.exists ? 'الملف غير موجود' : t.playing ? 'يعمل الآن' : s.current === id ? 'متوقف' : 'جاهز';
      c.pill.className = 'pill' + (!t.exists ? ' pill--warn' : t.playing ? ' pill--on' : '');
    });
  }

  Shr.views.sound = {
    enter() {
      if (!built) build();
      if (unsub) unsub();
      unsub = Shr.audio.subscribe(paint);
      paint(Shr.audio.state());
    },
    leave() { if (unsub) { unsub(); unsub = null; } },
    reset() { built = false; if (unsub) unsub(); unsub = null; Shr.clear(Shr.$('#view-sound')); },
  };
})();
