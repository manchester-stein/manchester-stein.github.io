// Flying bee cursor: idle PNG, four-frame GIF on movement, stinger PNG on press.
// The native cursor remains available until all assets have loaded successfully.
(() => {
  const root = document.documentElement;
  const toggle = document.querySelector('.bee-cursor-toggle');
  if (!toggle) return;

  const preferenceKey = 'manchester-stein-bee-cursor';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const assets = {
    idle: 'assets/cursor/bee-idle.png',
    flying: 'assets/cursor/bee-flying.gif',
    stinger: 'assets/cursor/stinger.png',
  };
  let enabled = true;
  try { enabled = localStorage.getItem(preferenceKey) !== 'off'; } catch {}

  const cursor = document.createElement('span');
  const artwork = document.createElement('img');
  artwork.className = 'bee-cursor-art';
  artwork.alt = '';
  artwork.draggable = false;
  cursor.append(artwork);
  cursor.className = 'bee-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;
  document.body.append(cursor);

  let ready = false;
  let idleTimer;
  let touchTimer;
  let releaseTimer;
  let pressed = false;
  let state = '';
  let pointerX = 0;
  let pointerY = 0;
  // 12 / 96 of the rendered 44px sprite; identical for mouse, pen and touch.
  const hotspot = 44 * 12 / 96;

  function position() {
    cursor.style.transform = `translate3d(${pointerX - hotspot}px, ${pointerY - hotspot}px, 0)`;
  }

  function setState(next) {
    if (next === state) return;
    state = next;
    cursor.dataset.state = next;
    artwork.src = assets[next];
    position();
  }

  function hide() {
    clearTimeout(idleTimer);
    clearTimeout(touchTimer);
    clearTimeout(releaseTimer);
    pressed = false;
    cursor.hidden = true;
    root.classList.remove('bee-cursor-active');
    setState('idle');
  }

  function updateToggle() {
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.title = enabled
      ? 'Bee cursor on — switch to standard pointer'
      : 'Bee cursor off — switch to bee';
  }

  function nativeTarget(target) {
    return target instanceof Element && Boolean(target.closest(
      'input, textarea, select, [contenteditable="true"], iframe'
    ));
  }

  function show(event, touch = false) {
    if (!enabled || !ready || nativeTarget(event.target)) {
      hide();
      return false;
    }
    cursor.classList.toggle('bee-cursor-touch', touch);
    // Keep the stinger tip exactly at the event coordinates in every pose.
    pointerX = event.clientX;
    pointerY = event.clientY;
    position();
    cursor.hidden = false;
    root.classList.toggle('bee-cursor-active', !touch);
    return true;
  }

  let toggleAnimationTimer;
  toggle.addEventListener('click', () => {
    clearTimeout(toggleAnimationTimer);
    toggle.classList.remove('is-swapping');
    if (!reducedMotion.matches) {
      void toggle.offsetWidth;
      toggle.classList.add('is-swapping');
      toggleAnimationTimer = setTimeout(() => toggle.classList.remove('is-swapping'), 280);
    }
    enabled = !enabled;
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch {}
    hide();
    updateToggle();
  });

  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (event.movementX === 0 && event.movementY === 0 && !cursor.hidden) return;
    if (!show(event)) return;
    clearTimeout(idleTimer);
    if (!pressed) setState(reducedMotion.matches ? 'idle' : 'flying');
    idleTimer = setTimeout(() => { if (!pressed) setState('idle'); }, 100);
  }, { passive: true });

  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !show(event, event.pointerType === 'touch')) return;
    clearTimeout(releaseTimer);
    clearTimeout(touchTimer);
    pressed = true;
    setState('stinger');
    if (event.pointerType === 'touch') {
      // Brief local feedback without preventing native scrolling, zooming, or taps.
      touchTimer = setTimeout(hide, 550);
    }
  }, { passive: true });

  document.addEventListener('pointerup', event => {
    if (!pressed) return;
    releaseTimer = setTimeout(() => {
      pressed = false;
      setState('idle');
    }, 160);
    if (event.pointerType === 'touch') {
      clearTimeout(touchTimer);
      touchTimer = setTimeout(hide, 550);
    }
  }, { passive: true });

  document.addEventListener('pointercancel', hide, { passive: true });
  document.documentElement.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'touch') hide();
  });
  document.addEventListener('pointerover', event => {
    if (nativeTarget(event.target)) hide();
  }, { passive: true });
  document.addEventListener('keydown', event => { if (event.key === 'Tab') hide(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.addEventListener('blur', hide);
  window.addEventListener('pagehide', hide);
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) setState('idle'); });
  artwork.addEventListener('error', () => { ready = false; hide(); toggle.hidden = true; });

  Promise.all(Object.values(assets).map(src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = reject;
    image.src = src;
  }))).then(() => {
    ready = true;
    setState('idle');
    updateToggle();
    toggle.hidden = false;
  }).catch(() => { hide(); });
})();
