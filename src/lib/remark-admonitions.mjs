import { defineMdastPlugin } from 'satteri';

const KINDS = new Set(['info', 'tip', 'danger', 'note', 'warning']);

export default defineMdastPlugin({
  name: 'admonitions',
  containerDirective(node, ctx) {
    if (!KINDS.has(node.name)) return;
    const kind = node.name;

    const heading = node.children[0];
    const hasLabel = heading?.type === 'paragraph' && heading.data?.directiveLabel;
    const untitled = hasLabel && ctx.textContent(heading).trim() === '';
    const label = hasLabel ? heading.children : null;
    if (hasLabel) ctx.removeChildAt(node, 0);

    ctx.setProperty(node, 'data', {
      ...node.data,
      hName: 'aside',
      hProperties: { class: `admonition admonition--${kind}` },
    });

    if (untitled) return;

    ctx.insertChildAt(node, 0, {
      type: 'paragraph',
      children: label ?? [{ type: 'text', value: kind.toUpperCase() }],
      data: { hName: 'p', hProperties: { class: 'admonition__title' } },
    });
  },
});
