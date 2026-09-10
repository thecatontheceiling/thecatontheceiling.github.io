import { defineMdastPlugin } from 'satteri';
import { isExternal } from './links.js';

export default defineMdastPlugin({
  name: 'external-links',
  link(node, ctx) {
    const url = node.url;
    if (!isExternal(url)) return;

    const data = node.data || {};
    const hProperties = { ...(data.hProperties || {}) };
    const existing = hProperties.class ? String(hProperties.class) : '';
    hProperties.class = (existing ? existing + ' ' : '') + 'external';
    hProperties.target = '_blank';
    hProperties.rel = 'noopener noreferrer';

    ctx.setProperty(node, 'data', { ...data, hProperties });
  },
});
