import { defineConfig, passthroughImageService } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import remarkAdmonitions from './src/lib/remark-admonitions.mjs';
import remarkExternalLinks from './src/lib/remark-externallinks.mjs';

export default defineConfig({
  site: 'https://thecatontheceiling.github.io',
  trailingSlash: 'never',
  build: { format: 'file' },
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
  markdown: {
    processor: satteri({
      features: { directive: true },
      mdastPlugins: [remarkAdmonitions, remarkExternalLinks],
    }),
  }
});
