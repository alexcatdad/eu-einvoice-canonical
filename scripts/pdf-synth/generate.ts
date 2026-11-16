/**
 * Synthetic Swedish PDF invoices with exact answer keys, for gaps in the real corpus (reduced VAT rates,
 * credit notes, Word/Excel output, ROT/RUT, factoring, font and producer edge cases).
 *
 *   bun scripts/pdf-synth/generate.ts [--out dir]     (default test/pdf-synth)
 *
 * One JSON spec per case in scripts/pdf-synth/cases/. Word and Excel cases are written as .docx/.xlsx and turned
 * into PDF by LibreOffice headless in the pinned container (scripts/pdf-synth/Dockerfile, run on the current
 * Docker context); pdf-lib cases are written directly. The answer key (truth/<name>.json, format
 * se-pdf/truth/SCHEMA.md) is derived from the spec; only its sha256 comes from the PDF. Reminders get no key.
 * LibreOffice output is not byte-reproducible: scripts/pdf-synth/check.ts compares extracted text instead.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sha256Hex } from '../../src/hash.js';
import { build, type CaseSpec, type Model } from './model.js';
import { toDocx, toXlsx } from './office.js';
import { toPdfLib } from './pdflib.js';

export const IMAGE = 'eu_einvoice_canonical-pdf-synth:1';
const HERE = import.meta.dir;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

export const loadCases = (): Model[] =>
  readdirSync(join(HERE, 'cases'))
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => build(JSON.parse(readFileSync(join(HERE, 'cases', n), 'utf8')) as CaseSpec));

async function sh(cmd: string, cwd?: string) {
  const p = Bun.spawn(['sh', '-c', cmd], { cwd, env: { ...process.env, COPYFILE_DISABLE: '1' }, stdout: 'inherit', stderr: 'inherit' });
  if ((await p.exited) !== 0) throw new Error(`failed: ${cmd}`);
}

/** Builds the image if missing, converts every office file in `inDir` to PDF in `outDir`, and copies the DejaVu font out. */
async function convertInContainer(inDir: string, outDir: string) {
  await sh(`docker image inspect ${IMAGE} >/dev/null 2>&1 || docker build -t ${IMAGE} -f Dockerfile .`, HERE);
  const name = `eu_einvoice_canonical-pdf-synth-run-${process.pid}`;
  const inner =
    'mkdir -p in out && tar -x -C in && ' +
    '(ls in | grep -q . && soffice -env:UserInstallation=file:///tmp/lo --headless --convert-to pdf --outdir out in/* >&2 || true) && ' +
    `cp ${FONT} out/DejaVuSans.ttf && tar -c -C out .`;
  try {
    await sh(
      `tar --no-xattrs -C '${inDir}' -cf - . | docker run --rm -i --name ${name} ${IMAGE} sh -c '${inner}' | tar -C '${outDir}' -xf -`,
    );
  } finally {
    await sh(`docker rm -f ${name} >/dev/null 2>&1 || true`);
  }
}

export async function generate(outDir: string): Promise<Model[]> {
  const models = loadCases();
  const work = mkdtempSync(join(tmpdir(), 'pdf-synth-'));
  try {
    const [inDir, convDir] = [join(work, 'in'), join(work, 'out')];
    mkdirSync(inDir);
    mkdirSync(convDir);
    for (const m of models) {
      if (m.spec.renderer === 'docx') writeFileSync(join(inDir, `${m.spec.file}.docx`), await toDocx(m.printed));
      if (m.spec.renderer === 'xlsx') writeFileSync(join(inDir, `${m.spec.file}.xlsx`), await toXlsx(m.printed));
    }
    await convertInContainer(inDir, convDir);
    const ttf = new Uint8Array(readFileSync(join(convDir, 'DejaVuSans.ttf')));
    mkdirSync(join(outDir, 'truth'), { recursive: true });
    for (const m of models) {
      const pdf =
        m.spec.renderer === 'pdflib'
          ? await toPdfLib(m.printed, m.spec.variant ?? 'standard14', ttf)
          : new Uint8Array(readFileSync(join(convDir, `${m.spec.file}.pdf`)));
      writeFileSync(join(outDir, `${m.spec.file}.pdf`), pdf);
      if (!m.truth) continue;
      const { schemaVersion, file, ...rest } = m.truth;
      const truth = { schemaVersion, file, sha256: await sha256Hex(pdf), ...rest };
      writeFileSync(join(outDir, 'truth', `${m.spec.file}.json`), `${JSON.stringify(truth, null, 2)}\n`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return models;
}

if (import.meta.main) {
  const i = process.argv.indexOf('--out');
  const out = resolve(i > 0 ? process.argv[i + 1] : join(HERE, '../../test/pdf-synth'));
  const models = await generate(out);
  const root = resolve(HERE, '../..');
  if (out.startsWith(`${root}/`)) await sh(`bunx biome format --write '${join(out, 'truth')}' >/dev/null`, root);
  console.log(`${models.length} cases written to ${out}`);
}
