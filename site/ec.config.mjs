// Expressive Code (Starlight's code blocks). Kept in its own file so the plugin below also applies to <Code>.
import { defineEcConfig } from '@astrojs/starlight/expressive-code';

/** Code blocks scroll sideways, so each <pre> takes the keyboard focus (a scrollable region must be reachable). */
const focusableCode = {
  name: 'focusable-code',
  hooks: {
    postprocessRenderedBlock: ({ renderData }) => {
      const walk = (node) => {
        if (node.type === 'element' && node.tagName === 'pre') node.properties.tabIndex = 0;
        for (const child of node.children ?? []) walk(child);
      };
      walk(renderData.blockAst);
    },
  },
};

export default defineEcConfig({
  themes: ['github-dark-default', 'github-light-default'],
  plugins: [focusableCode],
  styleOverrides: {
    codeFontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    uiFontFamily: "'Archivo', system-ui, sans-serif",
    borderRadius: '3px',
  },
});
