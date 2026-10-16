/** The site navigation, shared by the header, the phone menu and the footer. Labels are message keys in site/i18n/*.json. */
import en from '../../i18n/en.json' with { type: 'json' };

export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const REPO_URL = 'https://github.com/alexcatdad/eu-einvoice-canonical';

export const text = (key: string) => (en as Record<string, string>)[key] ?? key;
export const href = (route: string) => `${BASE}${route}`;

export interface NavItem {
  key: string;
  route: string;
  /** Route prefixes that count as this section. */
  match: (path: string) => boolean;
}

export const NAV: NavItem[] = [
  { key: 'nav.converter', route: '', match: (p) => p === '' },
  { key: 'nav.docs', route: 'docs/', match: (p) => p.startsWith('docs/') && !p.startsWith('docs/formats/') },
  { key: 'nav.formats', route: 'conformance/', match: (p) => p.startsWith('conformance/') || p.startsWith('docs/formats/') },
  { key: 'nav.realworld', route: 'corpus/', match: (p) => p.startsWith('corpus/') },
  { key: 'nav.api', route: 'api-reference/', match: (p) => /^(api-reference|api|problems)\//.test(p) },
  { key: 'nav.deliverables', route: 'deliverables/', match: (p) => p.startsWith('deliverables/') },
];

/** The page's route without the base: '' for the converter, 'docs/cli/' for a docs page. */
export const routeOf = (pathname: string) => (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.replace(/^\//, ''));

/** Pages whose frame (header, footer) is translated in the browser; every other page is English. */
export const isTranslated = (route: string) => route === '' || route === 'deliverables/';
