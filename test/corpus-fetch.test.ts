import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const script = resolve(import.meta.dir, '../scripts/fetch-corpora.sh');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'einvoice-corpus-'));
  roots.push(root);
  const upstream = join(root, 'upstream');
  const dest = join(root, 'repos');
  mkdirSync(upstream);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Synthetic Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.test',
    GIT_COMMITTER_NAME: 'Synthetic Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.test',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: `url.${pathToFileURL(upstream).href}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/fixture/corpus.git',
    GIT_CONFIG_KEY_1: 'protocol.file.allow',
    GIT_CONFIG_VALUE_1: 'always',
  };
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: upstream, env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q');
  mkdirSync(join(upstream, 'samples'));
  mkdirSync(join(upstream, 'other'));
  writeFileSync(join(upstream, 'samples/invoice.xml'), '<Invoice>synthetic</Invoice>');
  writeFileSync(join(upstream, 'other/excluded.txt'), 'excluded');
  git('add', '.');
  git('commit', '-qm', 'Synthetic corpus');
  const sha = git('rev-parse', 'HEAD');
  const run = (command: string, ...args: string[]) =>
    spawnSync('bash', ['-c', `source "$1"; dest="$2"; ${command}`, 'corpus-test', script, dest, ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 20_000,
    });
  return { root, upstream, dest, sha, run, git };
}

test('pinned sparse checkout is restored from the cache without contacting its remote', () => {
  const f = fixture();
  const fetch = () => f.run('fetch_one sample fixture/corpus "$3" "/samples/"', f.sha);
  expect(fetch().status).toBe(0);
  const sample = join(f.dest, 'sample');
  expect(existsSync(join(sample, 'other/excluded.txt'))).toBe(false);
  writeFileSync(join(sample, 'samples/invoice.xml'), 'tampered');
  writeFileSync(join(sample, 'samples/untracked.xml'), 'untracked');
  writeFileSync(join(sample, '.git/info/exclude'), 'samples/ignored.xml\n');
  writeFileSync(join(sample, 'samples/ignored.xml'), 'ignored');
  renameSync(f.upstream, join(f.root, 'offline-upstream'));
  const r = fetch();
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
  expect(readFileSync(join(sample, 'samples/invoice.xml'), 'utf8')).toBe('<Invoice>synthetic</Invoice>');
  expect(existsSync(join(sample, 'samples/untracked.xml'))).toBe(false);
  expect(existsSync(join(sample, 'samples/ignored.xml'))).toBe(false);
});

test('a changed pin fetches and checks out the requested new commit', () => {
  const f = fixture();
  expect(f.run('fetch_one sample fixture/corpus "$3" "/samples/"', f.sha).status).toBe(0);
  writeFileSync(join(f.upstream, 'samples/invoice.xml'), '<Invoice>updated</Invoice>');
  f.git('commit', '-qam', 'Update synthetic corpus');
  const sha = f.git('rev-parse', 'HEAD');
  expect(f.run('fetch_one sample fixture/corpus "$3" "/samples/"', sha).status).toBe(0);
  expect(readFileSync(join(f.dest, 'sample/samples/invoice.xml'), 'utf8')).toBe('<Invoice>updated</Invoice>');
});

test('bounded fetching reports failures in pin order and keeps successful corpora', () => {
  const f = fixture();
  const r = f.run(
    'corpora=("first|fixture/corpus|$3|/samples/" "missing|fixture/corpus|0000000000000000000000000000000000000000|/samples/" "last|fixture/corpus|$3|/samples/"); CORPUS_FETCH_JOBS=2 main',
    f.sha,
  );
  expect(r.status).toBe(0);
  expect(
    r.stdout
      .trim()
      .split('\n')
      .map((line) => line.split(' ')[0]),
  ).toEqual(['first', 'missing', 'last']);
  expect(r.stdout).toContain('FETCH FAILED');
  expect(r.stderr).toContain('WARNING: 1 corpora could not be fetched');
  expect(existsSync(join(f.dest, 'missing'))).toBe(false);
  for (const name of ['first', 'last']) expect(existsSync(join(f.dest, name, 'samples/invoice.xml'))).toBe(true);
});

test('fetch concurrency rejects invalid values', () => {
  const f = fixture();
  const r = f.run('CORPUS_FETCH_JOBS=0 main');
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('CORPUS_FETCH_JOBS must be an integer between 1 and 8');
});
