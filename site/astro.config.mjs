// The GitHub Pages site. Run `bun run build:site` from the repository root: site/prepare.ts writes the generated
// content first (docs pages from the README, sidebar, static files), then Astro builds into ../dist.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

const here = dirname(fileURLToPath(import.meta.url));
const generated = (name) => JSON.parse(readFileSync(join(here, '.generated', name), 'utf8'));
const SITE = 'https://alexcatdad.github.io';
const BASE = '/eu-einvoice-canonical/';
const REPO = 'https://github.com/alexcatdad/eu-einvoice-canonical';
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500&display=swap';

/** A small page at each address of the hand-built site that moved, pointing at the new one. */
function oldAddresses() {
  return {
    name: 'old-addresses',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const out = fileURLToPath(dir);
        for (const [from, to] of Object.entries(generated('redirects.json'))) {
          const target = `${BASE}${to}`;
          const file = join(out, from);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(
            file,
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Moved</title><meta name="robots" content="noindex"><link rel="canonical" href="${SITE}${target}"><meta http-equiv="refresh" content="0; url=${target}"></head><body><p>This page moved to <a href="${target}">${target}</a>.</p></body></html>\n`,
          );
        }
      },
    },
  };
}

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  outDir: '../dist',
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'E-invoice to JSON',
      description:
        'Convert any EU e-invoice (Peppol BIS 3, XRechnung, Factur-X, FatturaPA, KSeF and more) to one canonical JSON model, in your browser.',
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      customCss: ['./src/styles/theme.css'],
      components: {
        Header: './src/components/Header.astro',
        Footer: './src/components/Footer.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        PageTitle: './src/components/PageTitle.astro',
      },
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        { tag: 'link', attrs: { rel: 'stylesheet', href: FONTS } },
      ],
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
        styleOverrides: {
          codeFontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          uiFontFamily: "'Archivo', system-ui, sans-serif",
          borderRadius: '3px',
        },
      },
      // Edit links come from each page's frontmatter: README.md, docs/*.md or src/formats.ts.
      editLink: { baseUrl: `${REPO}/blob/main/` },
      credits: false,
      lastUpdated: false,
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../src/index.ts', '../src/server.ts', '../src/problems.ts'],
          tsconfig: './typedoc.tsconfig.json',
          output: 'api',
          sidebar: { label: 'TypeScript API', collapsed: true },
          typeDoc: {
            excludePrivate: true,
            excludeInternal: true,
            skipErrorChecking: true,
            readme: 'none',
            entryFileName: 'index',
          },
        }),
      ],
      sidebar: [
        ...generated('sidebar.json'),
        {
          label: 'Reference',
          items: [
            { label: 'HTTP API (OpenAPI)', link: '/api-reference/' },
            { label: 'Error types', link: '/problems/' },
            { label: 'Conformance checklist', link: '/conformance/' },
            { label: 'Real-world results', link: '/corpus/' },
            { label: 'Line labelling evaluation', link: '/eval/' },
            { label: 'Deliverables', link: '/deliverables/' },
          ],
        },
        typeDocSidebarGroup,
      ],
    }),
    react(),
    oldAddresses(),
  ],
  vite: {
    plugins: [tailwindcss()],
    // The library's React component imports react from the repository's node_modules; one copy only.
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { fs: { allow: ['..'] } },
    build: { sourcemap: true },
  },
});
