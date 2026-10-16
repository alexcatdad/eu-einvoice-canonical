/** Fills the CLI download list from the latest GitHub release, and falls back gracefully when a link is not published yet. */
const REPO = 'alexcatdad/eu-einvoice-canonical';

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
    version.textContent = `release ${release.tag_name}`;
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

/** corpus.html exists only once a corpus report has been published; until then the link points at the workflow. */
async function checkCorpusPage(): Promise<void> {
  const link = document.getElementById('corpus-page');
  if (!link) return;
  try {
    const res = await fetch('corpus.html', { method: 'HEAD' });
    if (!res.ok) link.closest('li')?.remove();
  } catch {
    link.closest('li')?.remove();
  }
}

void showRelease();
void checkCorpusPage();
