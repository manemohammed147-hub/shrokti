/* محمد AI: محادثة، مع حفظ السجل في قاعدة البيانات واقتراحات سريعة */
(function () {
  'use strict';
  const MAX = 400;
  let built = false, log, chips, input, sendBtn, busy = false, loadedFor = null;
  const STARTERS = ['شو بيحب محمد؟', 'كيف شخصية محمد؟', 'مين لارا؟', 'شو بيكره محمد؟'];

  function bubble(role, text) {
    const b = Shr.h('div', { class: 'ai-msg ai-msg--' + role },
      role === 'bot' && Shr.h('span', { class: 'ai-msg__av', 'aria-hidden': 'true', text: 'م' }),
      Shr.h('p', { class: 'ai-msg__text', text }));
    return b;
  }
  const scrollEnd = () => { log.scrollTop = log.scrollHeight; };

  function setChips(list) {
    Shr.clear(chips);
    (list || []).slice(0, 4).forEach((q) => chips.append(
      Shr.h('button', { class: 'chip-btn', type: 'button', text: q, onclick: () => ask(q) })));
  }

  function build() {
    built = true;
    const root = Shr.$('#view-ai');
    log = Shr.h('div', { class: 'ai-log', role: 'log', 'aria-live': 'polite' });
    chips = Shr.h('div', { class: 'ai-chips' });
    input = Shr.h('input', { class: 'composer__input', type: 'text', maxlength: String(MAX), placeholder: 'اسأل عن محمد…', 'aria-label': 'سؤالك', autocomplete: 'off', enterkeyhint: 'send' });
    sendBtn = Shr.h('button', { class: 'btn composer__send', type: 'submit', text: 'اسأل' });
    const form = Shr.h('form', { class: 'composer', novalidate: true }, input, sendBtn);
    form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (q) ask(q); else input.focus(); });
    root.append(
      Shr.h('header', { class: 'ai-head' },
        Shr.h('span', { class: 'ai-head__av', 'aria-hidden': 'true', text: 'م' }),
        Shr.h('div', {}, Shr.h('h2', { class: 'ai-head__name', text: 'محمد AI' }),
          Shr.h('p', { class: 'ai-head__sub', text: 'يجيبك من المعلومات التي يعرفها عن محمد فقط' }))),
      Shr.h('div', { class: 'ai-shell glass' }, log, chips, form));
  }

  async function loadHistory() {
    Shr.clear(log);
    log.append(Shr.ui.loading('نستعيد محادثتكما…'));
    try {
      const data = await Shr.api('/api/ai/history');
      Shr.clear(log);
      const hello = Shr.state.whoName ? `أهلين يا ${Shr.state.whoName} 👋 أنا محمد AI. اسألني عن محمد بأي طريقة بدك، وأنا بجاوبك من اللي بعرفه.` : 'أهلين! أنا محمد AI.';
      log.append(bubble('bot', hello));
      if (data.items.length) {
        log.append(Shr.h('div', { class: 'ai-sep', text: 'من محادثاتكما السابقة' }));
        data.items.forEach((m) => log.append(bubble(m.role === 'user' ? 'me' : 'bot', m.text)));
        log.append(Shr.h('div', { class: 'ai-sep', text: 'الآن' }));
      }
      setChips(STARTERS);
      loadedFor = Shr.state.who;
      scrollEnd();
    } catch (e) {
      Shr.clear(log);
      log.append(Shr.ui.error(e.message, loadHistory));
    }
  }

  async function ask(q) {
    if (busy) return;
    busy = true; sendBtn.disabled = true; input.value = '';
    setChips([]);
    log.append(bubble('me', q));
    const typing = Shr.h('div', { class: 'ai-msg ai-msg--bot ai-typing', 'aria-label': 'محمد AI يكتب' },
      Shr.h('span', { class: 'ai-msg__av', 'aria-hidden': 'true', text: 'م' }),
      Shr.h('p', { class: 'ai-msg__text' }, Shr.h('i'), Shr.h('i'), Shr.h('i')));
    log.append(typing); scrollEnd();
    try {
      const [data] = await Promise.all([Shr.api('/api/ai/ask', { method: 'POST', json: { message: q } }), Shr.sleep(650)]);
      typing.replaceWith(bubble('bot', data.reply.text));
      setChips(data.reply.suggestions);
    } catch (e) {
      typing.replaceWith(Shr.h('div', { class: 'ai-msg ai-msg--err' }, Shr.h('p', { class: 'ai-msg__text', text: e.message })));
      setChips(STARTERS);
    } finally {
      busy = false; sendBtn.disabled = false; scrollEnd();
      if (matchMedia('(hover:hover)').matches) input.focus();
    }
  }

  Shr.views.ai = {
    enter() {
      if (!built) build();
      if (loadedFor !== Shr.state.who) loadHistory();
      else scrollEnd();
    },
    reset() { built = false; loadedFor = null; Shr.clear(Shr.$('#view-ai')); },
  };
})();
