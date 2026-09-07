export const site = {
  title: "Lyssa's schizoposting club",
  description: "Lyssa's schizoposting club",
  logo: '/img/logo.webp',
  author: { name: 'Lyssa', title: 'Smart dumbass', url: 'https://github.com/thecatontheceiling' },
};

const pageLinks = [
  { label: 'Home', href: '/' },
  { label: 'Blog', href: '/blog' },
  { label: 'Donate', href: '/donate' },
];

export const menubar = [...pageLinks, { label: 'HITMAN 3 Patch', href: '/hitman3patch' }];

export const menus = [
  { title: 'Pages', items: pageLinks },
  { title: 'HITMAN 3 Patch', items: [
    { label: 'Installation', href: '/hitman3patch' },
    { label: 'Patch Guide', href: '/hitman3patchguide' },
  ]},
  { title: 'Projects', items: [
    { label: 'MAS', href: 'https://github.com/massgravel/Microsoft-Activation-Scripts' },
    { label: 'TSforge', href: 'https://github.com/massgravel/TSforge' },
    { label: 'DumbVersion', href: 'https://github.com/thecatontheceiling/DumbVersion' },
    { label: 'LyssaRDSGen', href: 'https://github.com/thecatontheceiling/LyssaRDSGen' },
    { label: 'CLiPExploder', href: 'https://github.com/thecatontheceiling/CLiPExploder' },
    { label: 'Shimbox', href: 'https://github.com/thecatontheceiling/shimbox' },
  ]}
];

export const tags = {
  'quick-posts': { label: 'Quick Posts', permalink: 'quick' },
  'tech-posts': { label: 'Tech', permalink: 'tech' },
};

export const footer = [
  { title: 'Navigate', items: [
    { label: 'Home', href: '/' },
    { label: 'Blog', href: '/blog' },
    { label: 'Donate', href: '/donate' },
    { label: 'HITMAN 3 Patch', href: '/hitman3patch' },
    { label: 'Patch Guide', href: '/hitman3patchguide' },
  ]},
  { title: 'Projects', items: [
    { label: 'MAS', href: 'https://github.com/massgravel/Microsoft-Activation-Scripts' },
    { label: 'TSforge', href: 'https://github.com/massgravel/TSforge' },
    { label: 'DumbVersion', href: 'https://github.com/thecatontheceiling/DumbVersion' },
    { label: 'LyssaRDSGen', href: 'https://github.com/thecatontheceiling/LyssaRDSGen' },
    { label: 'CLiPExploder', href: 'https://github.com/thecatontheceiling/CLiPExploder' },
    { label: 'Shimbox', href: 'https://github.com/thecatontheceiling/shimbox' },
  ]},
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
