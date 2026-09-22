/* الرئيسية: تحية، أبواب الدخول، والكلمة التي لا تختلف بصريًا عن أي كلمة أخرى */
(function () {
  'use strict';
  const MAGIC = 'مذهل';
  let ready = false;

  const PORTALS = [
    { go: 'memories', cls: 'portal--wide', emoji: '📖', title: 'الذكريات', text: 'ما جمعناه معًا، بالصورة والصوت والكلمة.', art: true },
    { go: 'ai', cls: 'portal--tall', emoji: '🤖', title: 'محمد AI', text: 'اسأله عن محمد بأي طريقة تحبها.' },
    { go: 'messages', cls: '', emoji: '💌', title: 'رسائل', text: 'كلمات تنتظر من يقرؤها.' },
    { go: 'game', cls: '', emoji: '🎮', title: 'اضرب محمد', text: 'لعبة كرتونية للضحك فقط.' },
  ];

  /** يجد الكلمة داخل النص ويجعلها قابلة للنقر دون أي تغيير في مظهرها. */
  function armMagicWord(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      let from = 0, idx;
      while ((idx = text.indexOf(MAGIC, from)) !== -1) {
        const before = text[idx - 1], after = text[idx + MAGIC.length];
        const isLetter = (c) => c && /[\u0621-\u064A\u0671-\u06D3]/.test(c);
        if (!isLetter(before) && !isLetter(after)) {
          const word = node.splitText(idx);
          word.splitText(MAGIC.length);
          const span = document.createElement('span'); // بلا class ولا style ولا أي سمة
          word.parentNode.insertBefore(span, word);
          span.appendChild(word);
          span.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.getSelection && String(window.getSelection()).trim().length > MAGIC.length) return;
            Shr.openGate();
          });
          return;
        }
        from = idx + MAGIC.length;
      }
    }
  }

  Shr.views.home = {
    enter() {
      const hello = Shr.$('#homeHello');
      hello.textContent = Shr.state.whoName ? `أهلًا يا ${Shr.state.whoName}` : '';
      if (ready) return;
      ready = true;
      armMagicWord(Shr.$('#homeLead'));

      const box = Shr.$('#portals');
      PORTALS.forEach((p) => {
        const card = Shr.h('button', { class: 'portal ' + p.cls, type: 'button', onclick: () => Shr.go(p.go) },
          p.art && Shr.img('we', 'portal__art', ''),
          Shr.h('span', { class: 'portal__emoji', 'aria-hidden': 'true', text: p.emoji }),
          Shr.h('span', { class: 'portal__title', text: p.title }),
          Shr.h('span', { class: 'portal__text', text: p.text }));
        box.append(card);
      });
    },
    refreshArt() {
      Shr.$$('.portal__art').forEach((img) => { img.src = Shr.asset('we'); });
    },
  };
})();
