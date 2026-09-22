/* رسائل: محادثة بين محمد ولارا، محفوظة في قاعدة البيانات، مع تحديث تلقائي خفيف */
(function () {
  'use strict';
  const root = () => Shr.$('#view-messages');
  let list, form, input, sendBtn, counter, poll, lastId = 0, built = false, lastDay = null;
  const MAX = 1500;

  function build() {
    built = true;
    list = Shr.h('div', { class: 'thread', role: 'log', 'aria-live': 'polite' });
    input = Shr.h('textarea', { class: 'composer__input', rows: '1', maxlength: String(MAX), placeholder: 'اكتب رسالتك هنا…', 'aria-label': 'نص الرسالة' });
    sendBtn = Shr.h('button', { class: 'btn composer__send', type: 'submit', text: 'إرسال' });
    counter = Shr.h('span', { class: 'composer__count', text: '' });
    form = Shr.h('form', { class: 'composer', novalidate: true }, input, sendBtn);
    form.addEventListener('submit', onSend);
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    root().append(
      Shr.h('header', { class: 'view-head' },
        Shr.h('h2', { class: 'view-head__title', text: 'رسائل' }),
        Shr.h('p', { class: 'view-head__sub', text: 'كلمات بين محمد ولارا، تبقى محفوظة هنا.' })),
      Shr.h('div', { class: 'thread-wrap glass' }, list),
      form);
  }

  function renderItems(items, replace) {
    if (replace) { Shr.clear(list); lastDay = null; }
    Shr.$$('.state', list).forEach((s) => s.remove());
    for (const m of items) {
      const day = Shr.dayKey(m.created_at);
      if (day !== lastDay) {
        list.append(Shr.h('div', { class: 'thread__day', text: Shr.fmtDate(m.created_at, false) }));
        lastDay = day;
      }
      const mine = m.sender.key === Shr.state.who;
      list.append(Shr.h('article', { class: 'msg msg--' + (m.sender.key === 'lara' ? 'l' : 'm') + (mine ? ' is-mine' : ''), dataset: { id: m.id } },
        Shr.h('header', { class: 'msg__head' }, Shr.h('strong', { text: m.sender.name }), Shr.h('time', { text: Shr.fmtTime(m.created_at) })),
        Shr.h('p', { class: 'msg__body', text: m.body })));
      lastId = Math.max(lastId, m.id);
    }
    if (!list.querySelector('.msg')) {
      list.append(Shr.ui.empty({ icon: '💌', title: 'لا توجد رسائل بعد', text: 'ابدأ أول رسالة، وستجدها هنا كلما عدتما.' }));
    }
  }

  async function load(initial) {
    if (initial) { Shr.clear(list); list.append(Shr.ui.loading('نفتح البريد…')); }
    try {
      const data = await Shr.api('/api/messages' + (initial ? '' : '?after_id=' + lastId));
      const stick = list.parentElement.scrollHeight - list.parentElement.scrollTop - list.parentElement.clientHeight < 120;
      if (initial) { lastId = 0; renderItems(data.items, true); }
      else if (data.items.length) renderItems(data.items, false);
      if (initial || (data.items.length && stick)) scrollEnd();
    } catch (e) {
      if (initial) { Shr.clear(list); list.append(Shr.ui.error(e.message, () => load(true))); }
    }
  }
  const scrollEnd = () => { const w = list.parentElement; w.scrollTop = w.scrollHeight; };

  async function onSend(e) {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) { Shr.toast('اكتب رسالتك أولًا.'); input.focus(); return; }
    sendBtn.disabled = true;
    try {
      const msg = await Shr.api('/api/messages', { method: 'POST', json: { body } });
      input.value = ''; input.style.height = 'auto';
      renderItems([msg], false);
      scrollEnd();
    } catch (err) {
      Shr.toast(err.message, 'error');
    } finally { sendBtn.disabled = false; input.focus(); }
  }

  Shr.views.messages = {
    enter() {
      if (!built) build();
      load(true);
      clearInterval(poll);
      poll = setInterval(() => { if (!document.hidden) load(false); }, 9000);
    },
    leave() { clearInterval(poll); },
    reset() { built = false; clearInterval(poll); Shr.clear(root()); },
  };
})();
