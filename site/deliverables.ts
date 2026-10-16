/** Fills the CLI download list from the latest GitHub release, and falls back gracefully when a link is not published yet. */
import { initLanguage, initSwitcher, onLanguageChange, t } from './i18n.js';

const REPO = 'alexcatdad/eu-einvoice-canonical';
let releaseTag: string | undefined;

interface Release {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

async function showRelease(): Promise<void> {
  const list = document.getElementById('release-assets');
  const version = document.getElementById('release-version');
  if (!list || !version) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const release = (await res.json()) as Release;
    releaseTag = release.tag_name;
    version.removeAttribute('data-i18n');
    version.textContent = t('deliv.cliRelease', { tag: releaseTag });
    list.replaceChildren(
      ...release.assets.map((a) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = a.browser_download_url;
        link.textContent = `${a.name} (${(a.size / 1048576).toFixed(0)} MB)`;
        li.append(link);
        return li;
      }),
    );
  } catch {
    // Offline or rate limited: the static link to the latest release stays.
  }
}

initLanguage();
initSwitcher();
onLanguageChange(() => {
  const version = document.getElementById('release-version');
  if (releaseTag && version) version.textContent = t('deliv.cliRelease', { tag: releaseTag });
});
document.getElementById('release-lookup')?.addEventListener('click', (e) => {
  const button = e.currentTarget as HTMLButtonElement;
  button.disabled = true;
  void showRelease().then(() => {
    if (releaseTag) button.closest('.release-lookup')?.remove();
    else button.disabled = false;
  });
});
