/* ✨ إنشاء ذكريات خاصة: نص + صورة اختيارية + تسجيل صوتي اختياري.
   لا يوجد أي خيار للظهور: كل ذكرى تُحفظ تلقائيًا في «الذكريات» وفي كل ما يتصل بها. */
(function () {
  'use strict';
  const MAX = 4000;
  const MAX_REC = 120;
  const REC_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  let built = false, root, r = {};
  let imageFile = null, imageUrl = null, audioBlob = null, audioUrl = null, audioSecs = 0;
  let rec = null, stream = null, chunks = [], recTimer = null, recStart = 0, saving = false;

  function build() {
    built = true;
    root = Shr.$('#view-create');
    r.text = Shr.h('textarea', { class: 'field__input field__input--area', rows: '6', maxlength: String(MAX), placeholder: 'ماذا حدث؟ ماذا شعرت؟ اكتب الذكرى كما تحب…', 'aria-label': 'نص الذكرى' });
    r.count = Shr.h('span', { class: 'field__count', text: '0 / ' + MAX });
    r.text.addEventListener('input', () => { r.count.textContent = r.text.value.length + ' / ' + MAX; });

    r.file = Shr.h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'memImage' });
    r.file.addEventListener('change', onPickImage);
    r.imgBox = Shr.h('div', { class: 'attach__preview', hidden: true });
    r.imgBtn = Shr.h('label', { class: 'btn btn--ghost', for: 'memImage', text: '🖼️ إضافة صورة' });

    r.recBtn = Shr.h('button', { class: 'btn btn--ghost', type: 'button', text: '🎙️ تسجيل صوتي', onclick: toggleRec });
    r.recInfo = Shr.h('span', { class: 'rec__info', role: 'status' });
    r.audioBox = Shr.h('div', { class: 'attach__preview', hidden: true });

    r.msg = Shr.h('p', { class: 'form-msg', role: 'alert' });
    r.save = Shr.h('button', { class: 'btn btn--lg', type: 'submit', text: 'حفظ الذكرى' });
    r.form = Shr.h('form', { class: 'create-form glass glass--edge', novalidate: true },
      Shr.h('div', { class: 'field' }, Shr.h('label', { class: 'field__label', for: 'memText', text: 'النص' }), r.text, r.count),
      Shr.h('div', { class: 'attach' },
        Shr.h('div', { class: 'attach__row' }, r.file, r.imgBtn, r.recBtn, r.recInfo),
        r.imgBox, r.audioBox),
      r.msg, r.save);
    r.text.id = 'memText';
    r.form.addEventListener('submit', onSave);
    r.done = Shr.h('div', { class: 'create-done glass glass--edge', hidden: true });

    root.append(
      Shr.h('header', { class: 'view-head' },
        Shr.h('h2', { class: 'view-head__title', text: 'إنشاء ذكريات خاصة' }),
        Shr.h('p', { class: 'view-head__sub', text: 'اكتب، أضف صورة، أو سجّل صوتك. وما إن تحفظ حتى تصبح جزءًا من الحكاية.' })),
      r.form, r.done);
  }

  /* ---------- الصورة ---------- */
  function onPickImage() {
    const f = r.file.files && r.file.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { setMsg('الملف المختار ليس صورة.'); r.file.value = ''; return; }
    if (f.size > 12 * 1024 * 1024) { setMsg('الصورة كبيرة جدًا (الحد 12 ميغابايت).'); r.file.value = ''; return; }
    clearImage();
    imageFile = f; imageUrl = URL.createObjectURL(f);
    Shr.clear(r.imgBox);
    r.imgBox.append(Shr.h('img', { src: imageUrl, alt: 'معاينة الصورة' }),
      Shr.h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'إزالة الصورة', onclick: clearImage }));
    r.imgBox.hidden = false; setMsg('');
  }
  function clearImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageFile = imageUrl = null; r.file.value = ''; r.imgBox.hidden = true; Shr.clear(r.imgBox);
  }

  /* ---------- التسجيل الصوتي ---------- */
  function recError(text) { r.recInfo.textContent = ''; setMsg(text); }
  async function toggleRec() {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      recError('متصفحك لا يدعم التسجيل الصوتي، أو أن الصفحة غير مفتوحة عبر اتصال آمن (https / localhost).'); return;
    }
    setMsg('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e && e.name;
      recError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'لم نحصل على إذن الميكروفون. اسمح به من إعدادات المتصفح ثم حاول مجددًا.'
        : name === 'NotFoundError' ? 'لا يوجد ميكروفون متاح على هذا الجهاز.' : 'تعذّر بدء التسجيل.');
      return;
    }
    const mime = REC_TYPES.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch (e) { stopStream(); recError('تعذّر بدء التسجيل على هذا المتصفح.'); return; }
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = onRecStop;
    clearAudio();
    Shr.audio && Shr.audio.duck(true); // نخفض الموسيقى كي لا تدخل في التسجيل
    rec.start();
    recStart = Date.now();
    r.recBtn.textContent = '⏹️ إيقاف التسجيل'; r.recBtn.classList.add('is-rec');
    recTimer = setInterval(() => {
      const s = (Date.now() - recStart) / 1000;
      r.recInfo.textContent = '● ' + Shr.fmtSecs(s);
      if (s >= MAX_REC) rec.stop();
    }, 250);
  }
  function stopStream() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
  function onRecStop() {
    clearInterval(recTimer);
    Shr.audio && Shr.audio.duck(false);
    stopStream();
    r.recBtn.textContent = '🎙️ تسجيل صوتي'; r.recBtn.classList.remove('is-rec'); r.recInfo.textContent = '';
    audioSecs = Math.round((Date.now() - recStart) / 1000);
    const type = (rec && rec.mimeType) || 'audio/webm';
    audioBlob = new Blob(chunks, { type });
    if (audioBlob.size < 200) { audioBlob = null; recError('التسجيل كان فارغًا. حاول مرة أخرى.'); return; }
    audioUrl = URL.createObjectURL(audioBlob);
    Shr.clear(r.audioBox);
    r.audioBox.append(Shr.ui.voice(audioUrl, audioSecs),
      Shr.h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'حذف التسجيل', onclick: clearAudio }));
    r.audioBox.hidden = false;
  }
  function clearAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioBlob = audioUrl = null; audioSecs = 0; r.audioBox.hidden = true; Shr.clear(r.audioBox);
  }

  /* ---------- الحفظ ---------- */
  const setMsg = (t) => { if (r.msg) r.msg.textContent = t || ''; };
  const extFor = (type) => (/mp4|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /wav/.test(type) ? 'wav' : 'webm');

  async function onSave(e) {
    e.preventDefault();
    if (saving) return;
    if (rec && rec.state === 'recording') { setMsg('أوقف التسجيل أولًا.'); return; }
    const body = r.text.value.trim();
    if (!body && !imageFile && !audioBlob) { setMsg('اكتب شيئًا، أو أضف صورة أو تسجيلًا صوتيًا.'); r.text.focus(); return; }
    setMsg(''); saving = true; r.save.disabled = true; r.save.textContent = 'نحفظ الذكرى…';
    const fd = new FormData();
    fd.append('body', body);
    if (imageFile) fd.append('image', imageFile, imageFile.name);
    if (audioBlob) { fd.append('audio', audioBlob, 'memory.' + extFor(audioBlob.type)); fd.append('audio_seconds', String(audioSecs)); }
    try {
      await Shr.api('/api/memories', { method: 'POST', form: fd });
      showDone();
    } catch (err) {
      setMsg(err.message);
    } finally {
      saving = false; r.save.disabled = false; r.save.textContent = 'حفظ الذكرى';
    }
  }

  function showDone() {
    r.form.hidden = true; r.done.hidden = false;
    Shr.clear(r.done);
    r.done.append(
      Shr.h('div', { class: 'state__icon', 'aria-hidden': 'true', text: '💗' }),
      Shr.h('h3', { text: 'حُفظت الذكرى' }),
      Shr.h('p', { text: 'صارت الآن جزءًا من الحكاية، ويمكنك إيجادها في الذكريات.' }),
      Shr.h('div', { class: 'result__actions' },
        Shr.h('button', { class: 'btn', type: 'button', dataset: { act: 'see' }, text: 'عرض الذكريات', onclick: () => Shr.go('memories') }),
        Shr.h('button', { class: 'btn btn--ghost', type: 'button', dataset: { act: 'again' }, text: 'ذكرى أخرى', onclick: resetForm })));
    const b = r.done.getBoundingClientRect();
    Shr.burst(b.left + b.width / 2, b.top + 60, ['💗', '✨', '💞', '🌟'], 14);
  }

  function resetForm() {
    r.text.value = ''; r.count.textContent = '0 / ' + MAX; clearImage(); clearAudio(); setMsg('');
    r.done.hidden = true; r.form.hidden = false; r.text.focus();
  }

  Shr.views.create = {
    enter() { if (!built) build(); if (!r.done.hidden) resetForm(); },
    leave() { if (rec && rec.state === 'recording') rec.stop(); },
    reset() {
      if (rec && rec.state === 'recording') { rec.onstop = null; rec.stop(); stopStream(); Shr.audio && Shr.audio.duck(false); }
      clearInterval(recTimer);
      if (built) { clearImage(); clearAudio(); }
      built = false; Shr.clear(Shr.$('#view-create'));
    },
  };
})();
