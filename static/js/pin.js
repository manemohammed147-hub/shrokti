/* لوحة الرمز: أربع نقاط + أرقام. الإرسال تلقائي عند اكتمال الرمز، والتحقق في الخادم فقط. */
(function () {
  'use strict';
  Shr.pinPad = function (root, opts) {
    const length = opts.length || 4;
    let value = '';
    let busy = false;
    let active = false;

    const dots = Shr.h('div', { class: 'pin__dots', 'aria-hidden': 'true' },
      Array.from({ length }, () => Shr.h('span', { class: 'pin__dot' })));
    const msg = Shr.h('p', { class: 'pin__msg', role: 'alert' });
    const label = Shr.h('span', { class: 'sr-only', text: 'الرمز السري' });

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    const pad = Shr.h('div', { class: 'keypad', dir: 'ltr' },
      keys.map((k) => {
        if (k === '') return Shr.h('span', { class: 'key key--void' });
        return Shr.h('button', {
          class: 'key' + (k === 'del' ? ' key--del' : ''), type: 'button', 'data-key': k,
          'aria-label': k === 'del' ? 'حذف' : k,
          onclick: () => press(k),
        }, k === 'del' ? '⌫' : k);
      }));

    root.append(label, dots, msg, pad);

    function paint() {
      Shr.$$('.pin__dot', dots).forEach((d, i) => d.classList.toggle('is-on', i < value.length));
    }
    function press(k) {
      if (busy) return;
      msg.textContent = '';
      if (k === 'del') value = value.slice(0, -1);
      else if (value.length < length) value += k;
      paint();
      if (value.length === length) submit();
    }
    async function submit() {
      busy = true;
      pad.classList.add('is-busy');
      try {
        await opts.onSubmit(value);
      } catch (e) {
        api.error(e && e.message ? e.message : 'الرمز غير صحيح.');
      } finally {
        busy = false;
        pad.classList.remove('is-busy');
      }
    }
    const api = {
      reset() { value = ''; paint(); msg.textContent = ''; },
      error(text) {
        msg.textContent = text;
        dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
        value = ''; setTimeout(paint, 260);
      },
      activate(on) { active = on; },
    };
    document.addEventListener('keydown', (e) => {
      if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    });
    return api;
  };
})();
