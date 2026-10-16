/** The site catalogues (site/i18n.ts) in React: components re-render when the language changes. */
import { useSyncExternalStore } from 'react';
import { currentLang, esc, onLanguageChange, t } from '../../i18n';
import en from '../../i18n/en.json' with { type: 'json' };

/** The current language; a component that calls this re-renders after every language switch. */
export const useLang = () => useSyncExternalStore(onLanguageChange, currentLang, () => 'en' as const);

/**
 * A catalogue message that holds markup (links, <strong>, <code>). Only keys of the bundled catalogue are rendered, and
 * every parameter is escaped first, so nothing from a file or the address bar reaches the markup.
 */
export function Html({
  k,
  params,
  as: Tag = 'span',
  className,
}: {
  k: string;
  params?: Record<string, string | number>;
  as?: 'span' | 'p';
  className?: string;
}) {
  if (!Object.hasOwn(en, k)) return null;
  const safe = params && Object.fromEntries(Object.entries(params).map(([name, v]) => [name, esc(String(v))]));
  // biome-ignore lint/security/noDangerouslySetInnerHtml: the markup is the bundled catalogue's, the parameters are escaped above
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: t(k, safe) }} />;
}
