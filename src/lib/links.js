const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

export function isExternal(href) {
  return typeof href === 'string' && EXTERNAL.test(href);
}
