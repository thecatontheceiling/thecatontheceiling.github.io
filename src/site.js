export const site = {
  title: "Lyssa's schizoposting club",
  description: "Lyssa's schizoposting club",
  logo: '/img/logo.webp',
};

const pageLinks = [
  { label: 'Home', href: '/' },
  { label: 'Blog', href: '/blog' },
  { label: 'Donate', href: '/donate' },
  { label: 'Guestbook', href: '/guestbook' },
];

const hitmanLinks = [
  { label: 'Installation', href: '/hitman3patch' },
  { label: 'Patch Guide', href: '/hitman3patchguide' },
];

export const menubar = [...pageLinks];

const projects = [
  { label: 'MAS', href: 'https://github.com/massgravel/Microsoft-Activation-Scripts' },
  { label: 'TSforge', href: 'https://github.com/massgravel/TSforge' },
  { label: 'DumbVersion', href: 'https://github.com/thecatontheceiling/DumbVersion' },
  { label: 'LyssaRDSGen', href: 'https://github.com/thecatontheceiling/LyssaRDSGen' },
  { label: 'CLiPExploder', href: 'https://github.com/thecatontheceiling/CLiPExploder' },
  { label: 'Shimbox', href: 'https://github.com/thecatontheceiling/shimbox' },
];

export const menus = [
  { title: 'Pages', items: pageLinks },
  { title: 'Projects', items: projects },
  { title: 'HITMAN 3 Patch', items: hitmanLinks },
];

export const tags = {
  'quick-posts': { label: 'Quick Posts', permalink: 'quick' },
  'tech-posts': { label: 'Tech', permalink: 'tech' },
};

export function resolveTag(id) {
  const tag = tags[id];
  if (!tag) throw new Error(`Unknown blog tag: ${id}`);
  return tag;
}

export function tagHref(id) {
  return `/blog/tags/${resolveTag(id).permalink}`;
}

export const footer = [
  { title: 'Navigate', items: [...menubar] },
  { title: 'Projects', items: projects },
  { title: 'Contact', items: [
    { label: 'thecatinyourceiling@duck.com', href: 'mailto:thecatinyourceiling@duck.com', icon: 'email' },
    { label: 'thecatinyourceiling', href: 'https://discord.com/users/1292181720354787421', icon: 'discord' },
    { label: 'thecatinyourceiling.38', href: 'https://signal.me/#eu/xPOwGT5i2r_AzNe7EqqVXTp5JhXmosxIk2qsg3EgvQK4k0sVOjpC64IMpOhDVZMQ', icon: 'signal' },
  ]},
  { title: 'Site', items: [
    { label: 'RSS feed', href: '/blog/rss.xml' },
    { label: 'Source', href: 'https://github.com/thecatontheceiling/thecatontheceiling.github.io' },
  ]},
];
