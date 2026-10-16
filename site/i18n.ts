/**
 * Site internationalisation. Messages live in site/i18n/<lang>.json (flat keys, English is the reference); canonical JSON keys are never translated.
 * Language order: ?lang=, then localStorage, then navigator.languages, then English.
 * Placeholders are written {name}. HTML pages mark static text with data-i18n (text), data-i18n-html (trusted markup from the catalogue),
 * data-i18n-attr ("attribute:key;attribute:key") and optionally data-i18n-params (JSON).
 */
import en from './i18n/en.json' with { type: 'json' };

export type Messages = Record<string, string>;

/** Language names are written in their own language and are not translated. */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Español' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'ro', name: 'Română' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];

/** English is bundled; every other catalogue is its own chunk, fetched the first time it is needed. */
const CATALOGUES: Partial<Record<Lang, Messages>> = { en };
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Messages }>> = {
  de: () => import('./i18n/de.json', { with: { type: 'json' } }),
  fr: () => import('./i18n/fr.json', { with: { type: 'json' } }),
  it: () => import('./i18n/it.json', { with: { type: 'json' } }),
  es: () => import('./i18n/es.json', { with: { type: 'json' } }),
  nl: () => import('./i18n/nl.json', { with: { type: 'json' } }),
  pl: () => import('./i18n/pl.json', { with: { type: 'json' } }),
  ro: () => import('./i18n/ro.json', { with: { type: 'json' } }),
};

async function loadCatalogue(lang: Lang): Promise<boolean> {
  if (CATALOGUES[lang]) return true;
  try {
    CATALOGUES[lang] = (await LOADERS[lang as Exclude<Lang, 'en'>]()).default;
    return true;
  } catch {
    return false;
  }
}
const STORAGE_KEY = 'einvoice-lang';

/** 'de-AT', 'DE_at' and 'de' all become 'de'; anything we have no catalogue for becomes undefined. */
export function normalizeLang(tag: string | null | undefined): Lang | undefined {
  const primary = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((l) => l.code === primary)?.code;
}

export interface LangSources {
  /** location.search, with or without the leading ?. */
  search?: string;
  /** The saved choice, if any. */
  stored?: string | null;
  /** navigator.languages, in the browser's order of preference. */
  languages?: readonly string[];
}

/** ?lang=, then the saved choice, then the browser's languages in order, then English. */
export function pickLanguage(src: LangSources): Lang {
  const fromUrl = normalizeLang(new URLSearchParams(src.search ?? '').get('lang'));
  if (fromUrl) return fromUrl;
  const fromStore = normalizeLang(src.stored);
  if (fromStore) return fromStore;
  for (const tag of src.languages ?? []) {
    const found = normalizeLang(tag);
    if (found) return found;
  }
  return 'en';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: Lang = 'en';
const listeners: (() => void)[] = [];

export const currentLang = (): Lang => current;

/** Registers a callback that runs after the language changes (to redraw dynamic content); returns a function that removes it. */
export function onLanguageChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Looks a message up in the current language, then in English, then returns the key. Placeholders without a value are left as written. */
export function t(key: string, params?: Record<string, string | number>): string {
  const msg = CATALOGUES[current]?.[key] ?? en[key as keyof typeof en] ?? key;
  return params ? msg.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : msg;
}

/** Escapes text for insertion into HTML built as a string. */
export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Fills every marked element under root from the current catalogue and sets <html lang>. */
export function applyDocument(root: ParentNode = document) {
  document.documentElement.lang = current;
  const paramsOf = (el: Element): Record<string, string> | undefined => {
    const raw = el.getAttribute('data-i18n-params');
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return undefined;
    }
  };
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n')!, paramsOf(el));
  // Markup comes only from the bundled catalogues: an unknown key is ignored, and values from the page are escaped before they are inserted.
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    const key = el.getAttribute('data-i18n-html') ?? '';
    if (!Object.hasOwn(en, key)) continue;
    const safe = Object.fromEntries(Object.entries(paramsOf(el) ?? {}).map(([k, v]) => [k, esc(String(v))]));
    el.innerHTML = t(key, safe);
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]'))
    for (const pair of el.getAttribute('data-i18n-attr')!.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key, paramsOf(el)));
    }
}

let switches = 0;

/**
 * Switches language: loads its catalogue, remembers the choice, drops a stale ?lang= from the address, updates the page and
 * tells listeners. If the catalogue cannot be loaded the page stays as it is; a later switch wins over an earlier one still loading.
 */
export async function setLanguage(lang: Lang, persist = true) {
  const ticket = ++switches;
  if (!(await loadCatalogue(lang)) || ticket !== switches) return;
  current = lang;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Storage can be blocked; the choice then lasts for this visit only.
    }
    try {
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.set('lang', lang);
        history.replaceState(null, '', url);
      }
    } catch {
      // Not critical.
    }
  }
  applyDocument();
  for (const fn of listeners) fn();
}

/** Picks the language for this visit and applies it to the static markup (English at once, any other language once its catalogue arrives). Call once at start-up. */
export function initLanguage() {
  const lang = pickLanguage({ search: location.search, stored: readStored(), languages: navigator.languages });
  applyDocument();
  if (lang !== 'en') void setLanguage(lang, false);
}

/** Fills the language <select> (id lang-select) and wires it up. The labels are the language names in their own language. */
export function initSwitcher() {
  const select = document.getElementById('lang-select') as HTMLSelectElement | null;
  if (!select || select.dataset.wired) return;
  select.dataset.wired = 'true';
  for (const l of LANGUAGES) {
    const option = new Option(l.name, l.code, false, l.code === current);
    option.lang = l.code;
    select.add(option);
  }
  // On phones the select is drawn as a short code (EN, DE...) so it fits on the wordmark row.
  const code = select.parentElement?.querySelector('.lang-code');
  const showCode = () => {
    if (code) code.textContent = current.toUpperCase();
  };
  showCode();
  select.addEventListener('change', () => {
    const lang = normalizeLang(select.value);
    if (lang) void setLanguage(lang);
  });
  onLanguageChange(() => {
    select.value = current;
    showCode();
  });
}
