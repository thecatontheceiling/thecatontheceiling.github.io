const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

export function normalizePath(pathname) {
  const path = String(pathname ?? '')
    .replace(/\.html$/, '')
    .replace(/\/$/, '')
    .replace(/\/index$/, '');
  return path || '/';
}

export function isExternal(href) {
  return typeof href === 'string' && EXTERNAL.test(href);
}
