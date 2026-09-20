import { defineMdastPlugin } from 'satteri';

function lazyify(value) {
  return value.replace(/<img\b([^>]*?)(\/?)>/g, (match, attrs, selfClose) => {
    if (/\bloading\s*=/.test(attrs)) return match;
    const cleaned = attrs.replace(/\s*\/$/, '').trimEnd();
    const slash = selfClose === '/' || /\/$/.test(attrs) ? '/' : '';
    return `<img${cleaned}${cleaned ? ' ' : ''}loading="lazy" decoding="async"${slash}>`;
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
