// https://docs.discord.com/developers/link-previews/component-embeds

const CONTAINER = 17;
const TEXT_DISPLAY = 10;
const MEDIA_GALLERY = 12;
const SEPARATOR = 14;
const ACTION_ROW = 1;
const BUTTON = 2;
const LINK_STYLE = 5;

// Limit enforced by Discord.
const MAX_PAYLOAD_BYTES = 3000;

export function escapeMarkdown(text) {
  return text.replace(/[\\*_~|`[\]()<>#]/g, '\\$&');
}

export function buildComponentEmbed({ title, description, url, subtext, image, buttons, accentColor }) {
  return {
    component: {
      type: CONTAINER,
      accent_color: parseInt(accentColor.slice(1), 16),
      components: [
        {
          type: TEXT_DISPLAY,
          content: `## [${escapeMarkdown(title)}](${url})\n${escapeMarkdown(description)}`,
        },
        {
          type: MEDIA_GALLERY,
          items: [{ media: { url: image.url }, description: image.alt }],
        },
        { type: SEPARATOR, spacing: 2 },
        { type: TEXT_DISPLAY, content: `-# ${escapeMarkdown(subtext)}` },
        {
          type: ACTION_ROW,
          components: buttons.map((button) => ({
            type: BUTTON,
            style: LINK_STYLE,
            label: button.label,
            url: button.url,
          })),
        },
      ],
    },
  };
}

export function serializeComponentEmbed(payload, label) {
  const json = JSON.stringify(payload).replaceAll('<', '\\u003c');
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new Error(`Discord component embed for "${label}" is ${bytes} bytes`);
  }
  return json;
}
