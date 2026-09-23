import { defineMdastPlugin } from 'satteri';

function lazyify(value) {
  return value.replace(/<img\b([^>]*?)>/g, (match, attrs) => {
    if (/\bloading\s*=/.test(attrs)) return match;
    const selfClose = /\/\s*$/.test(attrs);
    const cleaned = attrs.replace(/\s*\/$/, '').trimEnd();
    return `<img${cleaned}${cleaned ? ' ' : ''}loading="lazy" decoding="async"${selfClose ? '/' : ''}>`;
  });
}

export default defineMdastPlugin({
  name: 'lazy-images',
  html(node) {
    if (typeof node.value !== 'string' || !node.value.includes('<img')) return;
    const updated = lazyify(node.value);
    if (updated === node.value) return;
    return { type: 'html', value: updated };
  },
  image(node, ctx) {
    const data = node.data || {};
    const hProperties = { ...(data.hProperties || {}), loading: 'lazy', decoding: 'async' };
    ctx.setProperty(node, 'data', { ...data, hProperties });
  },
});
