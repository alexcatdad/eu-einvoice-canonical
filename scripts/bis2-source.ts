/** Compose the exact publisher OPENPEPPOL and OPENPEPPOL CORE sources; retain their assertion text unchanged. */
import { createHash } from 'node:crypto';

const SOURCES: Record<string, { core: string; patterns: number; assertions: number }> = {
  '08f18d40c85b5b5ec8f90b9cdc3fb0a66aa116a1385aa781fcc8dff3ebf447ba': {
    core: '4e4c43b21cba518bab2b85814bdc299a82036bbdabe8eec90d8c19a5b945316a',
    patterns: 1223,
    assertions: 1255,
  },
  c471ecef807a54d323cb74d554e2eddb0f59983a04deee1609eb7b6ff391d59a: {
    core: 'c2c85e4771d358f6c1241517a98f990a27781573ad256b1e0758956711cc97f7',
    patterns: 1317,
    assertions: 1350,
  },
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function combineBis2Core(mainBytes: Uint8Array, coreBytes: Uint8Array): Uint8Array {
  const expected = SOURCES[hash(mainBytes)];
  if (!expected || expected.core !== hash(coreBytes)) throw new Error('Unqualified BIS2 composition sources');
  const main = new TextDecoder('utf-8', { fatal: true }).decode(mainBytes);
  const core = new TextDecoder('utf-8', { fatal: true }).decode(coreBytes);
  const patterns = [...core.matchAll(/<pattern\b[^>]*>[\s\S]*?<\/pattern>/g)].map((m) => m[0]);
  if (patterns.length !== expected.patterns || (patterns.join('').match(/<assert\b/g) ?? []).length !== expected.assertions)
    throw new Error('Unexpected BIS2 core pattern inventory');
  const declarations = new Map<string, string>();
  const parseNamespace = (text: string) => {
    const prefix = text.match(/\bprefix="([^"]+)"/)?.[1];
    const uri = text.match(/\buri="([^"]+)"/)?.[1];
    if (!prefix || !uri) throw new Error('Unexpected BIS2 namespace declaration');
    return { prefix, uri };
  };
  for (const declaration of main.match(/<ns\b[^>]*\/>/g) ?? []) {
    const { prefix, uri } = parseNamespace(declaration);
    declarations.set(prefix, uri);
  }
  const extra: string[] = [];
  for (const declaration of core.match(/<ns\b[^>]*\/>/g) ?? []) {
    const { prefix, uri } = parseNamespace(declaration);
    if (declarations.has(prefix) && declarations.get(prefix) !== uri) throw new Error('Conflicting BIS2 namespaces');
    if (!declarations.has(prefix)) extra.push(declaration);
    declarations.set(prefix, uri);
  }
  if ((main.match(/<\/schema>/g) ?? []).length !== 1 || (main.match(/<include\b/g) ?? []).length !== 3)
    throw new Error('Unexpected BIS2 main source shape');
  return new TextEncoder().encode(
    main.replace('<phase', `${extra.join('\n')}\n<phase`).replace('</schema>', `${patterns.join('\n')}\n</schema>`),
  );
}

const INCLUDE_SOURCES: Record<string, readonly { href: string; sha256: string }[]> = {
  '51c7d5760ea035cb0c4ad71f38d8eb5db053ccdc2a76181206cbdb4973dc756c': [
    {
      href: 'abstract/BIIRULES-T10.sch',
      sha256: '8f9141f8b1fd39d021a250ace0112cf7ea95e9e11de861774bbdc04c447e6ce4',
    },
    {
      href: 'UBL/BIIRULES-UBL-T10.sch',
      sha256: '5f03e3ca1b7fb9a14c89843162090e8e2a13becb6ae8ad583b3996bbcb829d7c',
    },
    {
      href: 'codelist/BIIRULESCodesT10-UBL.sch',
      sha256: 'a54fd49e19649d1c52d6048301726016c6be49c8e4906ece124a9ac88fff0e74',
    },
  ],
  '08f18d40c85b5b5ec8f90b9cdc3fb0a66aa116a1385aa781fcc8dff3ebf447ba': [
    {
      href: 'abstract/OPENPEPPOL-T10.sch',
      sha256: '69b088db60cf206efbcd8a08da148f4ab515ae649bec2882eb14af5445fe08d5',
    },
    {
      href: 'UBL/OPENPEPPOL-UBL-T10.sch',
      sha256: '1ae77e891651e86ca8712bd94b1a9d1e8211f4a944c6fa4b8dd497891e537033',
    },
    {
      href: 'codelist/OPENPEPPOLCodesT10-UBL.sch',
      sha256: '3ebff99444a2282b392c6432434a1966bb49319ae01febdae0e8a983ffcb1f26',
    },
  ],
  bc511aa512e4579e66406db81cd865fd2d7b097013a1e8330b1896a58b87c73a: [
    {
      href: 'abstract/BIIRULES-T14.sch',
      sha256: '19c608841e70d4c63576b2abc823e5594497dad4228da4668507bd9d42f9d6b2',
    },
    {
      href: 'UBL/BIIRULES-UBL-T14.sch',
      sha256: '4cfeab7882ec0fb98e0f15b288bf09410a56a59e26ea4bacde5c9d230957bb5d',
    },
    {
      href: 'codelist/BIIRULESCodesT14-UBL.sch',
      sha256: '260762b0ad86b552e66c50c424d50dc1d621c9aa8128b8bbaa28a854e50bd432',
    },
  ],
  c471ecef807a54d323cb74d554e2eddb0f59983a04deee1609eb7b6ff391d59a: [
    {
      href: 'abstract/OPENPEPPOL-T14.sch',
      sha256: 'f6c194e5db4a6937169e126210eb8de3e072beab2bc543d0cbafd3a1186cd56f',
    },
    {
      href: 'UBL/OPENPEPPOL-UBL-T14.sch',
      sha256: '60f3a88fbf7a82ded721b07d0a42ca776303263c332694befed0621ef36003af',
    },
    {
      href: 'codelist/OPENPEPPOLCodesT14-UBL.sch',
      sha256: '659b99b29b4e68d90e58e2e49dd662e258294d0a604a5e295ac66e2167f8134a',
    },
  ],
};

const COMPOSED_MAIN: Record<string, string> = {
  '8011a5db40f14974b58f9800bc9b926c6fd5bf9145f6cda8935da385219f951a': '08f18d40c85b5b5ec8f90b9cdc3fb0a66aa116a1385aa781fcc8dff3ebf447ba',
  '36ebc68ada62f951218ee63dc669af9ce222c5dab01a4d3a25c1de4bf967cb00': 'c471ecef807a54d323cb74d554e2eddb0f59983a04deee1609eb7b6ff391d59a',
};
export function bis2Includes(mainBytes: Uint8Array): readonly { href: string; sha256: string }[] {
  const sourceHash = hash(mainBytes);
  const expected = INCLUDE_SOURCES[COMPOSED_MAIN[sourceHash] ?? sourceHash];
  if (!expected) throw new Error('Unqualified BIS2 include source');
  return expected;
}
export function inlineBis2Includes(mainBytes: Uint8Array, fragments: Record<string, Uint8Array>): Uint8Array {
  const expected = bis2Includes(mainBytes);
  let source = new TextDecoder('utf-8', { fatal: true }).decode(mainBytes);
  for (const include of expected) {
    const bytes = fragments[include.href];
    if (!bytes || hash(bytes) !== include.sha256) throw new Error('BIS2 include fragment hash mismatch');
    const fragment = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^<\?xml[^?]*\?>/, '');
    const withoutComments = fragment.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (
      !/^<pattern\b[^>]*>[\s\S]*<\/pattern>$/.test(withoutComments) ||
      (fragment.match(/<pattern\b/g) ?? []).length !== 1 ||
      /<(?:include|extends)\b/.test(fragment)
    )
      throw new Error('Unexpected BIS2 include fragment shape');
    const needle = `<include href="${include.href}"/>`;
    if (source.split(needle).length !== 2) throw new Error('Unexpected BIS2 include occurrence');
    source = source.replace(needle, () => fragment);
  }
  if (/<include\b/.test(source)) throw new Error('Unresolved BIS2 include');
  return new TextEncoder().encode(source);
}

const MIME_INPUTS: Record<string, string> = {
  '53e152ad05bfde786f2d7b0e8f0eee603ccc20374167e3775606d9985c06cf38': 'CL-T10-R008',
  a4bd3a40e8c0bf5a840cb21eeee29bdd92a9dcf1649c78ee8579b00275c6c2f7: 'CL-T14-R008',
};
/** Exact XPath2 equivalence: singleton context-node equality against each MIME literal becomes sequence membership. */
export function bis2MimeMembership(bytes: Uint8Array): Uint8Array {
  const rule = MIME_INPUTS[hash(bytes)];
  if (!rule) throw new Error('Unqualified BIS2 MIME membership source');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const assertions = [...source.matchAll(/<assert\b([^>]*)>/g)];
  const target = assertions.filter((m) => m[1].includes(`id="${rule}"`));
  if (target.length !== 1) throw new Error('Unexpected BIS2 MIME assertion inventory');
  const attributes = target[0][1];
  const test = attributes.match(/\btest="([^"]*)"/)?.[1];
  if (!test || hash(new TextEncoder().encode(test)) !== '1ddf8f0945c2c9b9e67df9264cb3b19af2c55e1957a632df3b9215ddab057548')
    throw new Error('Unqualified BIS2 MIME predicate');
  if (!/^\( \( \. = '[^']*'(?: or \. = '[^']*')* \) \)$/.test(test)) throw new Error('Unexpected BIS2 MIME predicate grammar');
  const literals = [...test.matchAll(/\. = ('[^']*')/g)].map((m) => m[1]);
  if (literals.length !== 917 || new Set(literals).size !== 917) throw new Error('Unexpected BIS2 MIME literal inventory');
  const needle = `test="${test}"`;
  if (source.split(needle).length !== 2) throw new Error('Unexpected BIS2 MIME predicate occurrence');
  return new TextEncoder().encode(source.replace(needle, () => `test=". = (${literals.join(', ')})"`));
}
