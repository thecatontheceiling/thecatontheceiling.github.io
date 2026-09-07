import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '../../site.js';

export async function GET(context) {
  const posts = await getCollection('blog');
  return rss({
    title: site.title,
    description: "Lyssa's blog",
    site: context.site,
    items: posts
      .sort((a, b) => b.data.date - a.data.date)
      .map((post) => ({
        title: post.data.title,
        description: post.data.description ?? '',
        pubDate: post.data.date,
        link: `/blog/${post.id}`,
      })),
  });
}
