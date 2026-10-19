/** Pinned native OIOUBL3 suite, including the EN16931 XSLT shipped for each syntax. */
interface OioSefSpec {
  kind: 'sef';
  id: string;
  title: string;
  layer: 'semantic' | 'profile';
  syntax: string;
  version: string;
  releaseDate: string;
  effectiveFrom: string;
  effectiveUntil: null;
  license: string;
  upstream: string;
  note: string;
  entry: string;
  xslt: {
    reportFormat?: 'oioubl2' | 'oioubl202';
    archive: string;
    path: string;
    archiveSha256: string;
    sha256: string;
    additionalFiles: { path: string; to: string }[];
  };
}
export const OIOUBL_VALIDATION_SPECS: OioSefSpec[] = [
  {
    kind: 'sef',
    id: 'oioubl3-en16931-invoice-3.2.4',
    title: 'OIOUBL3 invoice semantic rules3.2.4',
    layer: 'semantic',
    syntax: 'ubl',
    version: '3.2.4',
    releaseDate: '2026-08-10',
    effectiveFrom: '2026-08-10',
    effectiveUntil: null,
    license: 'Danish Business Authority EUPL1.1 or CC-BY-SA4.0, with embedded OASIS/CEN notices preserved in LICENSE.txt',
    upstream: 'https://oioubl-demo.nemhandel.dk/oioubl/Overblik.html',
    note: 'Official2026-08-10 package. Matches OIOUBL3.0 customization; package edition3.2.4 is not a document-declared edition. Embedded EN16931 and native syntax-specific XSLTs must remain paired. The authority labels OIOUBL3 documentation as release-candidate.',
    xslt: {
      archive: 'https://oioubl-demo.nemhandel.dk/oioubl/downloads/OIOUBL3_2026-08-10_v3.2.4.156accde.zip',
      path: 'OIOUBL-Invoice/Schematron/EN16931-UBL-validation.xslt',
      archiveSha256: '5e2afd22a07e766c5416ef95b69fe83a465a1e17fc7d98d52abd58fb022ba9a0',
      sha256: '10836eeb8bdb0731088efba6e35c9c4436fe1f940713d468655dde6e232a8ba0',
      additionalFiles: [
        {
          path: 'README.txt',
          to: 'LICENSE.txt',
        },
      ],
    },
    entry: 'oioubl3-en16931-invoice-3.2.4.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'oioubl3-invoice-3.2.4',
    title: 'OIOUBL3 invoice profile rules3.2.4',
    layer: 'profile',
    syntax: 'ubl',
    version: '3.2.4',
    releaseDate: '2026-08-10',
    effectiveFrom: '2026-08-10',
    effectiveUntil: null,
    license: 'Danish Business Authority EUPL1.1 or CC-BY-SA4.0, with embedded OASIS/CEN notices preserved in LICENSE.txt',
    upstream: 'https://oioubl-demo.nemhandel.dk/oioubl/Overblik.html',
    note: 'Official2026-08-10 package. Matches OIOUBL3.0 customization; package edition3.2.4 is not a document-declared edition. Embedded EN16931 and native syntax-specific XSLTs must remain paired. The authority labels OIOUBL3 documentation as release-candidate.',
    xslt: {
      archive: 'https://oioubl-demo.nemhandel.dk/oioubl/downloads/OIOUBL3_2026-08-10_v3.2.4.156accde.zip',
      path: 'OIOUBL-Invoice/Schematron/OIOUBL-Invoice.xslt',
      archiveSha256: '5e2afd22a07e766c5416ef95b69fe83a465a1e17fc7d98d52abd58fb022ba9a0',
      sha256: '8fda6e5276e0890891523ef43b205270cb6f436464cd2830373d22312efa031e',
      additionalFiles: [
        {
          path: 'README.txt',
          to: 'LICENSE.txt',
        },
      ],
    },
    entry: 'oioubl3-invoice-3.2.4.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'oioubl3-en16931-creditnote-3.2.4',
    title: 'OIOUBL3 creditnote semantic rules3.2.4',
    layer: 'semantic',
    syntax: 'ubl',
    version: '3.2.4',
    releaseDate: '2026-08-10',
    effectiveFrom: '2026-08-10',
    effectiveUntil: null,
    license: 'Danish Business Authority EUPL1.1 or CC-BY-SA4.0, with embedded OASIS/CEN notices preserved in LICENSE.txt',
    upstream: 'https://oioubl-demo.nemhandel.dk/oioubl/Overblik.html',
    note: 'Official2026-08-10 package. Matches OIOUBL3.0 customization; package edition3.2.4 is not a document-declared edition. Embedded EN16931 and native syntax-specific XSLTs must remain paired. The authority labels OIOUBL3 documentation as release-candidate.',
    xslt: {
      archive: 'https://oioubl-demo.nemhandel.dk/oioubl/downloads/OIOUBL3_2026-08-10_v3.2.4.156accde.zip',
      path: 'OIOUBL-Creditnote/Schematron/EN16931-UBL-validation.xslt',
      archiveSha256: '5e2afd22a07e766c5416ef95b69fe83a465a1e17fc7d98d52abd58fb022ba9a0',
      sha256: '3fc7a5d8c11284eca616982780a9227c66928917fac167fdef20a6c7ea4d4455',
      additionalFiles: [
        {
          path: 'README.txt',
          to: 'LICENSE.txt',
        },
      ],
    },
    entry: 'oioubl3-en16931-creditnote-3.2.4.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'oioubl3-creditnote-3.2.4',
    title: 'OIOUBL3 creditnote profile rules3.2.4',
    layer: 'profile',
    syntax: 'ubl',
    version: '3.2.4',
    releaseDate: '2026-08-10',
    effectiveFrom: '2026-08-10',
    effectiveUntil: null,
    license: 'Danish Business Authority EUPL1.1 or CC-BY-SA4.0, with embedded OASIS/CEN notices preserved in LICENSE.txt',
    upstream: 'https://oioubl-demo.nemhandel.dk/oioubl/Overblik.html',
    note: 'Official2026-08-10 package. Matches OIOUBL3.0 customization; package edition3.2.4 is not a document-declared edition. Embedded EN16931 and native syntax-specific XSLTs must remain paired. The authority labels OIOUBL3 documentation as release-candidate.',
    xslt: {
      archive: 'https://oioubl-demo.nemhandel.dk/oioubl/downloads/OIOUBL3_2026-08-10_v3.2.4.156accde.zip',
      path: 'OIOUBL-Creditnote/Schematron/OIOUBL-Creditnote.xslt',
      archiveSha256: '5e2afd22a07e766c5416ef95b69fe83a465a1e17fc7d98d52abd58fb022ba9a0',
      sha256: '10d6e618c3af8a02545ab8488b43e24d5f31a79c1d8061c12237ae0278e1a912',
      additionalFiles: [
        {
          path: 'README.txt',
          to: 'LICENSE.txt',
        },
      ],
    },
    entry: 'oioubl3-creditnote-3.2.4.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'oioubl2-invoice-1.15.2',
    title: 'OIOUBL2.1 invoice native1.15.2 rules',
    layer: 'profile',
    syntax: 'ubl',
    version: '1.15.2',
    releaseDate: '2025-03-20',
    effectiveFrom: '2025-03-20',
    effectiveUntil: null,
    license:
      'No explicit license text found in the official archive; redistribution qualification remains pending. Original source and authority README preserved.',
    upstream: 'https://nemhandel.dk/vejledning-oioubl-dokumentationsoversigt',
    note: 'Exact OIOUBL-2.1 native rules, not OIOUBL-2.02. Official Error report translated to SVRL by a strict shape-checked importing wrapper; original rules are unmodified. Official severity table identifies Invoice/CreditNote findings as F (fatal).',
    xslt: {
      archive: 'https://git.erst.dk/openebusiness/common/-/raw/master/released/oioubl/OIOUBL_Schematron_2025-03-20_v1.15.2.c480718e.zip',
      path: 'Stylesheets/OIOUBL_Invoice_Schematron.xsl',
      archiveSha256: '2b6d1945a5948500c8aeabd3bd637ea4774e3d0dbacf179132f677300b825090',
      sha256: 'f31f5f0a0f240d336f6e0a3b10ccc65a0a64d1fb3c5e6173caf7ae97ab03f84f',
      reportFormat: 'oioubl2',
      additionalFiles: [
        {
          path: 'Dokumentation/ReadmeUK.txt',
          to: 'UPSTREAM-README.txt',
        },
        {
          path: 'Dokumentation/ID_Error_List.csv',
          to: 'ERROR-SEVERITIES.csv',
        },
      ],
    },
    entry: 'oioubl2-invoice-1.15.2.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'oioubl2-creditnote-1.15.2',
    title: 'OIOUBL2.1 creditnote native1.15.2 rules',
    layer: 'profile',
    syntax: 'ubl',
    version: '1.15.2',
    releaseDate: '2025-03-20',
    effectiveFrom: '2025-03-20',
    effectiveUntil: null,
    license:
      'No explicit license text found in the official archive; redistribution qualification remains pending. Original source and authority README preserved.',
    upstream: 'https://nemhandel.dk/vejledning-oioubl-dokumentationsoversigt',
    note: 'Exact OIOUBL-2.1 native rules, not OIOUBL-2.02. Official Error report translated to SVRL by a strict shape-checked importing wrapper; original rules are unmodified. Official severity table identifies Invoice/CreditNote findings as F (fatal).',
    xslt: {
      archive: 'https://git.erst.dk/openebusiness/common/-/raw/master/released/oioubl/OIOUBL_Schematron_2025-03-20_v1.15.2.c480718e.zip',
      path: 'Stylesheets/OIOUBL_CreditNote_Schematron.xsl',
      archiveSha256: '2b6d1945a5948500c8aeabd3bd637ea4774e3d0dbacf179132f677300b825090',
      sha256: 'fc2436e88d28f1d29daa3461dc6be90540a92f040f875865a2b1103e62c580b5',
      reportFormat: 'oioubl2',
      additionalFiles: [
        {
          path: 'Dokumentation/ReadmeUK.txt',
          to: 'UPSTREAM-README.txt',
        },
        {
          path: 'Dokumentation/ID_Error_List.csv',
          to: 'ERROR-SEVERITIES.csv',
        },
      ],
    },
    entry: 'oioubl2-creditnote-1.15.2.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'oioubl-2.02-invoice-1.11.1',
    title: 'OIOUBL2.02 Invoice native1.11.1 rules (historical2019-04-08)',
    layer: 'profile',
    syntax: 'ubl',
    version: '1.11.1',
    releaseDate: '2019-04-08',
    effectiveFrom: '2019-04-08',
    effectiveUntil: null,
    license:
      'No explicit license text found in this official historical source closure; redistribution qualification remains unresolved. Local evaluation only.',
    upstream: 'https://git.erst.dk/openebusiness/common/-/tree/244631323b2fb56eda3bf7475bc050e65ad84b38/resources/Schematrons/OIOUBL',
    note: 'Pinned historical authority1.11.1.35666 rules from the observed last pre-UBL2.1 Invoice source revision in this authority history, not a claim of latest2.02 globally or current Danish production compliance. releaseDate/effectiveFrom use the stylesheet header date2019-04-08 to identify this snapshot; legal activation/current acceptance was not independently verified. Both stylesheet Information header and checks explicitly identify OIOUBL-2.02 with UBL2.0; document2.01 is also accepted upstream but is not selected here. Original source bytes are preserved unmodified. No imports, includes, or external document reads. Pinned compatibility-source.xslt makes nine Invoice and six CreditNote direct-node format-number first arguments explicit number(...) conversions within XPath attributes, preserving XSLT1 semantics under Saxon-JS2.7; numeric sum expressions, Pattern/Description text and rules are unchanged. Original UTF16 source remains verbatim and compatibility source uses UTF8 with a separately pinned derived hash. Strict Error report wrapper maps the original Description F/W code prefixes to fatal/warning and rejects unknown prefixes. Archive contains no license/readme; no redistribution grant is inferred.',
    xslt: {
      archive:
        'https://git.erst.dk/openebusiness/common/-/archive/244631323b2fb56eda3bf7475bc050e65ad84b38/common-244631323b2fb56eda3bf7475bc050e65ad84b38.zip?path=resources/Schematrons/OIOUBL',
      path: 'common-244631323b2fb56eda3bf7475bc050e65ad84b38-resources-Schematrons-OIOUBL/resources/Schematrons/OIOUBL/OIOUBL_Invoice_Schematron.xsl',
      archiveSha256: '5b0d5fa5d6affed0102eaf1b9f03664cffad424c2c3531791fb9423857e6491e',
      sha256: '858ec42d3d68bcaab173aaa0aae0d46bba1ff6ce1774002961d391324a611b10',
      reportFormat: 'oioubl202',
      additionalFiles: [],
    },
    entry: 'oioubl-2.02-invoice-1.11.1.sef.json.gz',
  },
  {
    kind: 'sef',
    id: 'oioubl-2.02-creditnote-1.11.1',
    title: 'OIOUBL2.02 CreditNote native1.11.1 rules (historical2019-04-08)',
    layer: 'profile',
    syntax: 'ubl',
    version: '1.11.1',
    releaseDate: '2019-04-08',
    effectiveFrom: '2019-04-08',
    effectiveUntil: null,
    license:
      'No explicit license text found in this official historical source closure; redistribution qualification remains unresolved. Local evaluation only.',
    upstream: 'https://git.erst.dk/openebusiness/common/-/tree/244631323b2fb56eda3bf7475bc050e65ad84b38/resources/Schematrons/OIOUBL',
    note: 'Pinned historical authority1.11.1.35666 rules from the observed last pre-UBL2.1 Invoice source revision in this authority history, not a claim of latest2.02 globally or current Danish production compliance. releaseDate/effectiveFrom use the stylesheet header date2019-04-08 to identify this snapshot; legal activation/current acceptance was not independently verified. Both stylesheet Information header and checks explicitly identify OIOUBL-2.02 with UBL2.0; document2.01 is also accepted upstream but is not selected here. Original source bytes are preserved unmodified. No imports, includes, or external document reads. Pinned compatibility-source.xslt makes nine Invoice and six CreditNote direct-node format-number first arguments explicit number(...) conversions within XPath attributes, preserving XSLT1 semantics under Saxon-JS2.7; numeric sum expressions, Pattern/Description text and rules are unchanged. Original UTF16 source remains verbatim and compatibility source uses UTF8 with a separately pinned derived hash. Strict Error report wrapper maps the original Description F/W code prefixes to fatal/warning and rejects unknown prefixes. Archive contains no license/readme; no redistribution grant is inferred.',
    xslt: {
      archive:
        'https://git.erst.dk/openebusiness/common/-/archive/244631323b2fb56eda3bf7475bc050e65ad84b38/common-244631323b2fb56eda3bf7475bc050e65ad84b38.zip?path=resources/Schematrons/OIOUBL',
      path: 'common-244631323b2fb56eda3bf7475bc050e65ad84b38-resources-Schematrons-OIOUBL/resources/Schematrons/OIOUBL/OIOUBL_CreditNote_Schematron.xsl',
      archiveSha256: '5b0d5fa5d6affed0102eaf1b9f03664cffad424c2c3531791fb9423857e6491e',
      sha256: '9f10414ac955f7da6bbfda86364a2e08aa7bc9c681a8bfb71d8ad83265853674',
      reportFormat: 'oioubl202',
      additionalFiles: [],
    },
    entry: 'oioubl-2.02-creditnote-1.11.1.sef.json.gz',
  },
];
