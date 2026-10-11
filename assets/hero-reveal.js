(() => {
  const caption = document.getElementById('illustration-credit');
  const source = document.getElementById('illustration-credit-source');
  if (!caption || !source) return;

  const secret = 'stein';
  let matched = '';

  function reset() {
    matched = '';
  }

  function listen(event) {
    const editing = event.composedPath().some(node =>
      node instanceof HTMLElement &&
      (node.isContentEditable || node.matches('input, textarea, select, [role="textbox"]'))
    );
    if (editing || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      reset();
      return;
    }
    if (event.repeat || event.key === 'Shift') return;
    if (!/^[a-z]$/i.test(event.key)) {
      reset();
      return;
    }

    // Retain only a matching prefix, never a history of typed text.
    matched += event.key.toLowerCase();
    while (matched && !secret.startsWith(matched)) matched = matched.slice(1);
    if (matched !== secret) return;

    caption.replaceChildren(source.content.cloneNode(true));
    caption.hidden = false;
    reset();
    document.removeEventListener('keydown', listen);
    document.removeEventListener('focusin', reset);
    window.removeEventListener('blur', reset);
  }

  document.addEventListener('keydown', listen);
  document.addEventListener('focusin', reset);
  window.addEventListener('blur', reset);
})();
