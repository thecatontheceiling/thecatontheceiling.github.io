import { defineMdastPlugin } from 'satteri';

const EXTERNAL = /^https?:/i;

export default defineMdastPlugin({
  name: 'external-links',
  link(node, ctx) {
    const url = node.url;
    if (!EXTERNAL.test(url)) return;

    const data = node.data || {};
    const hProperties = { ...(data.hProperties || {}) };
    const existing = hProperties.class ? String(hProperties.class) : '';
    hProperties.class = (existing ? existing + ' ' : '') + 'external';
    hProperties.target = '_blank';
    hProperties.rel = 'noopener noreferrer';

    ctx.setProperty(node, 'data', { ...data, hProperties });
  },
});
