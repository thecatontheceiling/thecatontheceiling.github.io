const TYPE_MS_PER_CHAR = 12;
const TYPE_MS_MAX = 320;
const FLASH_MS = 1800;

export function initContact() {
  for (const root of document.querySelectorAll('[data-contact]')) setup(root);
}

function setup(root) {
  const items = [...root.querySelectorAll('.contact__item')];
  const statusText = root.querySelector('.contact__status-text');
  const pos = root.querySelector('.contact__pos');
  const live = root.querySelector('[data-contact-live]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const canCopy = typeof navigator.clipboard?.writeText === 'function';
  const idle = statusText.textContent;

  let selected = null;
  let flashTimer = 0;

  const type = (text) => {
    if (statusText.textContent === text) return;
    statusText.textContent = text;
    if (reducedMotion.matches) return;
    statusText.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
      duration: Math.min(text.length * TYPE_MS_PER_CHAR, TYPE_MS_MAX),
      easing: `steps(${text.length}, jump-start)`,
    });
  };

  const select = (item) => {
    if (item === selected) return;
    selected?.classList.remove('is-selected');
    selected = item;
    item?.classList.add('is-selected');
    pos.textContent = item ? `${items.indexOf(item) + 1}/${items.length}` : `-/${items.length}`;
    if (!flashTimer) type(item ? item.dataset.status : idle);
  };

  const focusedItem = () => items.find((item) => item.contains(document.activeElement)) ?? null;

  const flash = (message, item) => {
    clearTimeout(flashTimer);
    for (const done of root.querySelectorAll('.contact__item.is-copied')) done.classList.remove('is-copied');
    item?.classList.add('is-copied');
    live.textContent = message;
    type(message);
    flashTimer = setTimeout(() => {
      flashTimer = 0;
      item?.classList.remove('is-copied');
      live.textContent = '';
      type(selected ? selected.dataset.status : idle);
    }, FLASH_MS);
  };

  const copy = async (item) => {
    const value = item.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      flash(`Copied ${value} to clipboard.`, item);
    } catch {
      flash(`Couldn't reach the clipboard. It's ${value}.`, null);
    }
  };

  for (const item of items) {
    item.addEventListener('pointerenter', () => select(item));
  }
  root.querySelector('.contact__menu').addEventListener('pointerleave', () => select(focusedItem()));
  root.addEventListener('focusin', () => select(focusedItem()));
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget)) select(null);
  });

  if (canCopy) {
    root.addEventListener('click', (event) => {
      const button = event.target.closest('.contact__copy');
      if (button) copy(button.closest('.contact__item'));
    });
    root.classList.add('can-copy');
  }

  root.classList.add('is-live');
  pos.textContent = `-/${items.length}`;
}
