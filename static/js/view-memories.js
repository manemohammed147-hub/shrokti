/* الذكريات (غرام): الخط الزمني لكل الذكريات المحفوظة في قاعدة البيانات */
(function () {
  'use strict';
  const PAGE = 12;
  let built = false, listEl, moreBtn, countEl, oldest = null, token = 0;

  Shr.memoryCard = function (m) {
    const img = m.image_url
      ? Shr.h('figure', { class: 'mem__img' }, Shr.h('img', { src: m.image_url, alt: 'صورة من الذكرى', loading: 'lazy', decoding: 'async' }))
      : m.image_missing ? Shr.h('div', { class: 'mem__missing', text: 'الصورة غير متوفرة حاليًا' }) : null;
    if (img && m.image_url) {
      const el = img.firstChild;
      el.addEventListener('error', () => { img.replaceWith(Shr.h('div', { class: 'mem__missing', text: 'تعذّر عرض الصورة' })); });
    }
    const voice = m.audio_url ? Shr.ui.voice(m.audio_url, m.audio_seconds)
      : m.audio_missing ? Shr.h('div', { class: 'mem__missing', text: 'التسجيل الصوتي غير متوفر حاليًا' }) : null;
    return Shr.h('article', { class: 'mem mem--' + (m.author.key === 'lara' ? 'l' : 'm'), dataset: { id: m.id } },
      Shr.h('header', { class: 'mem__head' }, Shr.ui.chip(m.author), Shr.h('time', { datetime: m.created_at, text: Shr.fmtDate(m.created_at) })),
      m.body && Shr.h('p', { class: 'mem__text', text: m.body }),
      img, voice);
  };

  function build() {
    built = true;
    const root = Shr.$('#view-memories');
    countEl = Shr.h('span', { class: 'mem-hero__count' });
    listEl = Shr.h('div', { class: 'mem-list' });
    moreBtn = Shr.h('button', { class: 'btn btn--ghost mem-more', type: 'button', hidden: true, text: 'عرض ذكريات أقدم', onclick: () => load(false) });
    root.append(
      Shr.h('section', { class: 'mem-hero' },
        Shr.h('figure', { class: 'mem-hero__frame' },
          Shr.img('we', 'mem-hero__img', 'محمد ولارا'),
          Shr.h('span', { class: 'mem-hero__leak', 'aria-hidden': 'true' })),
        Shr.h('div', { class: 'mem-hero__copy' },
          Shr.h('h2', { class: 'mem-hero__title', text: 'غرام' }),
          Shr.h('p', { class: 'mem-hero__text', text: 'كل ما كتبناه وسجّلناه وصوّرناه، مرتّبًا كما حدث.' }),
          Shr.h('div', { class: 'mem-hero__row' },
            Shr.h('button', { class: 'btn', type: 'button', text: '✨ ذكرى جديدة', onclick: () => Shr.go('create') }), countEl))),
      listEl, moreBtn);
  }

  async function load(fresh) {
    const my = ++token;
    if (fresh) { Shr.clear(listEl); listEl.append(Shr.ui.loading('نستحضر الذكريات…')); oldest = null; moreBtn.hidden = true; }
    moreBtn.disabled = true;
    try {
      const data = await Shr.api('/api/memories?limit=' + PAGE + (oldest ? '&before_id=' + oldest : ''));
      if (my !== token) return;
      if (fresh) Shr.clear(listEl);
      data.items.forEach((m) => { listEl.append(Shr.memoryCard(m)); oldest = m.id; });
      countEl.textContent = data.total ? (data.total === 1 ? 'ذكرى واحدة' : data.total + ' ذكريات') : '';
      moreBtn.hidden = !data.has_more;
      if (!listEl.children.length) {
        listEl.append(Shr.ui.empty({
          icon: '📖', title: 'لا توجد ذكريات بعد',
          text: 'أول ذكرى تُكتب هنا ستبدأ الحكاية.',
          action: { label: 'أنشئ أول ذكرى', onClick: () => Shr.go('create') },
        }));
      }
    } catch (e) {
      if (my !== token) return;
      if (fresh) { Shr.clear(listEl); listEl.append(Shr.ui.error(e.message, () => load(true))); }
      else Shr.toast(e.message, 'error');
    } finally { moreBtn.disabled = false; }
  }

  Shr.views.memories = {
    enter() { if (!built) build(); load(true); },
    reset() { built = false; Shr.clear(Shr.$('#view-memories')); },
    refreshArt() { const i = Shr.$('.mem-hero__img'); if (i) i.src = Shr.asset('we'); },
  };
})();
