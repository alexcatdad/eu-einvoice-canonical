/** Smoke the actual packed file list from an installed-package layout, without downloading dependencies. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approvedBundleIds, loadDistribution } from './validation-distribution.js';

const root = join(import.meta.dir, '..');
const temp = mkdtempSync(join(tmpdir(), 'einvoice-package-'));
function run(command: string[], cwd = root, expected = 0): string {
  const p = Bun.spawnSync(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, npm_config_cache: join(temp, 'npm-cache') },
  });
  if (p.exitCode !== expected)
    throw new Error(`${command.join(' ')}: expected exit ${expected}, got ${p.exitCode}\n${p.stdout.toString()}${p.stderr.toString()}`);
  return p.stdout.toString();
}
try {
  run(['bun', 'run', 'build:package']);
  const packed = JSON.parse(run(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', temp]))[0];
  const inventory: string[] = packed.files.map((f: { path: string }) => f.path);
  for (const path of [
    'lib/index.js',
    'lib/index.d.ts',
    'lib/render/index.js',
    'lib/render/index.d.ts',
    'lib/writers/index.js',
    'lib/writers/index.d.ts',
    'lib/mcp/server.js',
    'lib/mcp/server.d.ts',
    'lib/signature/trust-lists.js',
    'lib/signature/trust-lists.d.ts',
    'lib/trust-lists-cli.js',
    'lib/cli.js',
    'lib/react/index.js',
    'lib/react/invoice.css',
    'schemas/canonical-invoice.v1.schema.json',
    'lib/validation/schematron-worker.js',
  ])
    assert.ok(inventory.includes(path), `package is missing ${path}`);
  const approved = approvedBundleIds(root);
  const expectedAssets = approved.flatMap((id) => {
    const manifest = JSON.parse(readFileSync(join(root, 'validation/bundles', id, 'manifest.json'), 'utf8'));
    return ['manifest.json', ...manifest.files.map((file: { path: string }) => file.path)].map(
      (path) => `validation/bundles/${id}/${path}`,
    );
  });
  assert.deepEqual(
    inventory.filter((path) => path.startsWith('validation/bundles/')).sort(),
    expectedAssets.sort(),
    'tarball must contain exactly the reviewed bundles and their complete source/license closure',
  );
  for (const path of [
    'validation/NOTICE',
    'validation/distribution.json',
    ...Object.keys(loadDistribution(root).licenseFiles).map((name) => `validation/licenses/${name}`),
  ])
    assert.ok(inventory.includes(path), `package is missing ${path}`);
  assert.ok(!inventory.some((p) => p.startsWith('src/') || p.startsWith('test/')), 'development sources leaked into package');
  const modules = join(temp, 'node_modules');
  const installed = join(modules, 'eu-einvoice-canonical');
  mkdirSync(installed, { recursive: true });
  run(['tar', '-xzf', join(temp, packed.filename), '-C', installed, '--strip-components=1']);
  assert.deepEqual(approvedBundleIds(installed), approved, 'installed assets, licenses and notices match the reviewed hashes');
  // Use the locked checkout dependencies, while loading our own code and assets solely from the tarball.
  symlinkSync(join(root, 'node_modules'), join(installed, 'node_modules'), 'dir');
  for (const peer of ['react', 'react-dom']) symlinkSync(join(root, 'node_modules', peer), join(modules, peer), 'dir');
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
  const invoice = readFileSync(join(root, 'test/fixtures/xrechnung-ubl.xml'), 'utf8');
  writeFileSync(join(temp, 'invoice.xml'), invoice);
  writeFileSync(join(temp, 'invalid-profile.xml'), invoice.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''));
  writeFileSync(join(temp, 'held.xml'), readFileSync(join(root, 'test/validation-fixtures/peppol-valid-invoice.xml')));
  writeFileSync(
    join(temp, 'smoke.mjs'),
    `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import * as core from 'eu-einvoice-canonical';
    import { convert, validateSource, validationPassed, buildLineAnnotationInput, validateLineAnnotations } from 'eu-einvoice-canonical';
    import { renderHtml, renderPdf } from 'eu-einvoice-canonical/render';
    import { createHandler } from 'eu-einvoice-canonical/server';
    import { toUbl, toCii } from 'eu-einvoice-canonical/writers';
    import { loadTrustLists } from 'eu-einvoice-canonical/trust-lists';
    import { createMcpServer } from 'eu-einvoice-canonical/mcp';
    for (const retired of ['matching', 'findDuplicates', 'buildJournalEntry', 'renderHtml', 'toUbl', 'loadTrustLists']) assert.equal(retired in core, false);
    assert.equal(typeof loadTrustLists, 'function');
    const mcp = createMcpServer({allowDirs:[]});
    await mcp.close();
    assert.equal((await createHandler()(new Request('http://localhost/health'))).status, 200);
    assert.ok(import.meta.resolve('eu-einvoice-canonical/react/invoice.css').endsWith('/lib/react/invoice.css'));
    assert.equal(typeof buildLineAnnotationInput, 'function');
    assert.equal(typeof validateLineAnnotations, 'function');
    const result = await convert(readFileSync(new URL('./invoice.xml', import.meta.url)), 'invoice.xml', undefined, {validate:true,provenance:true,relations:true});
    assert.equal(result.outcomes[0].status, 'ok');
    const invoice = result.outcomes[0].invoices[0];
    assert.ok(validationPassed(invoice.source.validation), JSON.stringify(invoice.source.validation));
    assert.equal(invoice.source.valueOrigins['/lines/0/netAmount'], 'source');
    assert.ok(invoice.source.provenance['/lines/0/netAmount']);
    assert.ok(renderHtml(invoice).includes(invoice.id));
    assert.equal(new TextDecoder().decode((await renderPdf(invoice)).subarray(0,5)), '%PDF-');
    assert.ok(toUbl(invoice).includes(invoice.id));
    assert.ok(toCii(invoice).includes(invoice.id));
    assert.ok(validationPassed(await validateSource({xml:readFileSync(new URL('./invoice.xml', import.meta.url),'utf8')}))); 
    const invalid = await validateSource({xml:readFileSync(new URL('./invalid-profile.xml', import.meta.url),'utf8')});
    assert.equal(invalid.profile, 'failed');
    assert.ok(invalid.findings.some(finding => finding.ruleId === 'BR-DE-15' && finding.severity === 'fatal'));
    const held = await validateSource({xml:readFileSync(new URL('./held.xml', import.meta.url),'utf8')});
    assert.equal(held.result, 'incomplete');
    assert.equal(held.schema, 'passed');
    assert.equal(held.semantic, 'passed');
    assert.equal(held.profile, 'unavailable');
    assert.equal(validationPassed(held), false);
    const {Invoice} = await import('eu-einvoice-canonical/react');
    const {createElement} = await import('react');
    const {renderToStaticMarkup} = await import('react-dom/server');
    assert.ok(renderToStaticMarkup(createElement(Invoice,{invoice})).includes(invoice.id));
  `,
  );
  for (const runtime of [process.env.NODE_BIN ?? 'node', 'bun']) {
    assert.ok(run([runtime, '--version'], temp).trim());
    run([runtime, 'smoke.mjs'], temp);
    console.log(`Packed conversion, validation, HTTP, MCP, HTML/PDF and React consumers passed: ${runtime}`);
  }
  // Exercise the installed root with a loader that rejects all optional consumers.
  writeFileSync(
    join(temp, 'core-only.mjs'),
    "import {convert} from 'eu-einvoice-canonical'; import {readFileSync} from 'node:fs'; const r=await convert(readFileSync('invoice.xml'),'invoice.xml',undefined,{validate:true,relations:true,provenance:true}); if(r.outcomes[0].status!=='ok'||r.outcomes[0].invoices[0].source.validation.result!=='valid') throw new Error('Core conversion failed');",
  );
  writeFileSync(
    join(temp, 'core-loader.mjs'),
    "export async function resolve(specifier, context, next) { const resolved=await next(specifier,context); if (['/lib/render/','/lib/react/','/lib/writers/','/lib/mcp/','/lib/server.js','/signature/tsl-load.js','/signature/trust-lists.js','/node_modules/react/','/node_modules/react-dom/','/node_modules/@modelcontextprotocol/'].some(part=>resolved.url.includes(part))) throw new Error('Optional consumer loaded: '+resolved.url); return resolved; }",
  );
  run([process.env.NODE_BIN ?? 'node', '--experimental-loader', './core-loader.mjs', 'core-only.mjs'], temp);
  writeFileSync(join(temp, 'browser.mjs'), "export { convert, detectXml } from 'eu-einvoice-canonical';");
  run(['bun', 'build', 'browser.mjs', '--target=browser', '--outfile=browser.js'], temp);
  writeFileSync(
    join(temp, 'consumer.ts'),
    `
    import { convert, type ConvertResult, type CanonicalInvoice, type LineAnnotations, type ValidationSuite } from 'eu-einvoice-canonical';
    import { renderHtml, type RenderHtmlOptions } from 'eu-einvoice-canonical/render';
    import { toUbl, type UblOptions } from 'eu-einvoice-canonical/writers';
    import { createMcpServer, type McpServerOptions } from 'eu-einvoice-canonical/mcp';
    import { loadTrustLists, type LoadOptions } from 'eu-einvoice-canonical/trust-lists';
    import { createHandler, type ServerOptions } from 'eu-einvoice-canonical/server';
    import { Invoice, type InvoiceProps } from 'eu-einvoice-canonical/react';
    const html = (invoice: CanonicalInvoice, options: RenderHtmlOptions) => renderHtml(invoice, options);
    const ubl = (invoice: CanonicalInvoice, options: UblOptions) => toUbl(invoice, options);
    const mcp = (options: McpServerOptions) => createMcpServer(options);
    const trust = (options: LoadOptions) => loadTrustLists(options);
    const converted: Promise<ConvertResult> = convert(new Uint8Array());
    converted.then(result => { for (const outcome of result.outcomes) if(outcome.status === 'ok') console.log(outcome.invoices.length); });
  `,
  );
  run(
    [
      'bun',
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--skipLibCheck',
      '--module',
      'NodeNext',
      '--target',
      'ES2022',
      join(temp, 'consumer.ts'),
    ],
    temp,
  );
  console.log('Packed browser bundle and TypeScript consumer passed.');
  const cli = run(['bun', join(installed, 'lib/cli.js'), 'convert', '--validate', '--quiet', join(temp, 'invoice.xml')], temp);
  assert.equal(JSON.parse(cli)[0].source.validation.result, 'valid');
  const held = run(['bun', join(installed, 'lib/cli.js'), 'convert', '--validate', '--quiet', join(temp, 'held.xml')], temp, 6);
  assert.equal(JSON.parse(held)[0].source.validation.result, 'incomplete');
  const invalid = run(
    ['bun', join(installed, 'lib/cli.js'), 'convert', '--validate', '--quiet', join(temp, 'invalid-profile.xml')],
    temp,
    4,
  );
  assert.equal(JSON.parse(invalid)[0].source.validation.profile, 'failed');
  assert.ok(existsSync(join(installed, 'lib/index.d.ts')));
  console.log(`Packed CLI validation passed; checked ${inventory.length} packaged files.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
