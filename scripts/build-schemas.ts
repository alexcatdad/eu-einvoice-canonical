/**
 * Generates the JSON Schemas (draft 2020-12) for CanonicalInvoice and ConvertResult from the TypeScript types:
 *   bun scripts/build-schemas.ts           write schemas/*.schema.json
 *   bun scripts/build-schemas.ts --check   fail if the committed files differ from what the types produce
 *
 * Branded primitives (Decimal, IsoDate, IsoTime) become string patterns, open code-list unions become
 * strings with the common values as `examples`, and BT/BG comments stay as `description`s.
 * Objects stay open (additive changes keep the same major version, see "Schema versioning" in the README).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  createFormatter,
  createParser,
  createProgram,
  DEFAULT_CONFIG,
  LiteralType,
  SchemaGenerator,
  type SubNodeParser,
} from 'ts-json-schema-generator';
import { FORMATS } from '../src/formats.js';
import { schemaVersion } from '../src/index.js';

const root = join(import.meta.dir, '..');
export const SCHEMA_BASE_URL = 'https://alexcatdad.github.io/eu-einvoice-canonical/schemas';

export const SCHEMAS = [
  { type: 'CanonicalInvoice', file: `canonical-invoice.${schemaVersion}.schema.json`, title: 'CanonicalInvoice' },
  { type: 'ConvertResult', file: `convert-result.${schemaVersion}.schema.json`, title: 'ConvertResult' },
] as const;

/** Pattern definitions for the branded string types. */
const PRIMITIVES: Record<string, object> = {
  Decimal: {
    type: 'string',
    pattern: '^[+-]?\\d+(\\.\\d+)?$',
    description: 'Plain decimal string: optional sign, digits, optional fraction. No exponent, no grouping.',
  },
  IsoDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD, no time zone.' },
  IsoTime: {
    type: 'string',
    pattern: '^\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})?$',
    description: 'hh:mm:ss, optionally with a UTC offset.',
  },
  FormatId: { type: 'string', enum: FORMATS.map((f) => f.id), description: 'Identifier of a detected e-invoice format.' },
};
const MARK = '\u0000primitive:';

// Walks nodes (not strings) of the generator's own TypeScript: the one bundled with ts-json-schema-generator.
const ts = createRequire(require.resolve('ts-json-schema-generator'))('typescript');
const opaque: SubNodeParser = {
  supportsNode: (n: any) => n.kind === ts.SyntaxKind.TypeAliasDeclaration && n.name.text in PRIMITIVES,
  createType: (n: any) => new LiteralType(MARK + n.name.text),
};

const decode = (ref: string) => decodeURIComponent(ref.slice(ref.lastIndexOf('/') + 1));

function generate(type: string, file: string): string {
  const config = {
    ...DEFAULT_CONFIG,
    path: join(root, 'src/index.ts'),
    tsconfig: join(root, 'tsconfig.json'),
    type,
    skipTypeCheck: true,
    expose: 'export',
    topRef: true,
    jsDoc: 'extended',
  } as any;
  const program = createProgram(config);
  const parser = createParser(program, config, (chain) => {
    chain.addNodeParser(opaque);
  });
  const raw = new SchemaGenerator(program, parser, createFormatter(config), config).createSchema(type) as any;
  const defs: Record<string, any> = raw.definitions;

  // Open<'A' | 'B'> is `anyOf [string, enum]`: keep it a plain string, the literals become examples.
  const open: Record<string, any> = {};
  for (const [name, def] of Object.entries(defs)) {
    if (!name.startsWith('Open<')) continue;
    const literals = def.anyOf?.find((a: any) => a.enum)?.enum;
    open[name] = {
      type: 'string',
      ...(literals ? { examples: literals } : {}),
      ...(def.description ? { description: def.description } : {}),
    };
    delete defs[name];
  }

  const used = new Set<string>();
  const walk = (node: any): any => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    if (typeof node.$ref === 'string' && node.$ref.startsWith('#/definitions/')) {
      const name = decode(node.$ref);
      if (name in open) {
        const { $ref, ...rest } = node;
        return { ...open[name], ...rest };
      }
      return { ...node, $ref: `#/$defs/${name}` };
    }
    if (typeof node.const === 'string' && node.const.startsWith(MARK)) {
      const name = node.const.slice(MARK.length);
      used.add(name);
      const { const: _c, type: _t, ...rest } = node;
      return { $ref: `#/$defs/${name}`, ...rest };
    }
    // Closed objects would reject fields added in a later minor release.
    return Object.fromEntries(
      Object.entries(node)
        .filter(([k, v]) => !(k === 'additionalProperties' && v === false))
        .map(([k, v]) => [k, walk(v)]),
    );
  };

  const rootName = decode(raw.$ref);
  const $defs: Record<string, any> = {};
  for (const [name, def] of Object.entries(defs)) $defs[name] = walk(def);
  // Keep the entry type inline at the top; every other type stays addressable under $defs.
  const rootDef = $defs[rootName];
  delete $defs[rootName];
  // A definition that is just a marker (e.g. `type Amount = Decimal`) resolves through $ref like the rest.
  for (const name of used) $defs[name] = PRIMITIVES[name];
  const sorted = Object.fromEntries(Object.entries($defs).sort(([a], [b]) => a.localeCompare(b)));
  const out = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${SCHEMA_BASE_URL}/${file}`,
    title: type,
    ...rootDef,
    $defs: sorted,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

const check = process.argv.includes('--check');
const dir = join(root, 'schemas');
if (!check) mkdirSync(dir, { recursive: true });
let stale = false;
for (const s of SCHEMAS) {
  const text = generate(s.type, s.file);
  const path = join(dir, s.file);
  if (check) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {}
    if (current !== text) {
      console.error(`schemas/${s.file} is stale: run "bun run build:schemas" and commit the result`);
      stale = true;
    }
  } else {
    writeFileSync(path, text);
    console.log(`Wrote schemas/${s.file} (${(text.length / 1024).toFixed(0)} KB)`);
  }
}
if (stale) process.exit(1);
