import { defineMdastPlugin } from 'satteri';
import { isExternal } from './links.js';

export default defineMdastPlugin({
  name: 'external-links',
  link(node, ctx) {
    const url = node.url;
    if (!isExternal(url)) return;

    const data = node.data || {};
    const hProperties = { ...(data.hProperties || {}) };
    hProperties.class = [hProperties.class, 'external'].filter(Boolean).join(' ');
    hProperties.target = '_blank';
    hProperties.rel = 'noopener noreferrer';

    ctx.setProperty(node, 'data', { ...data, hProperties });
  },
});
