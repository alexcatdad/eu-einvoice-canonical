/** Exact publisher-supplied France RFE chains. Original sources, terms and policy note remain bundled. */
interface Common {
  id: string;
  title: string;
  layer: 'schema' | 'semantic' | 'profile';
  syntax: string;
  version: string;
  releaseDate: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  license: string;
  upstream: string;
  note: string;
}
interface Sef extends Common {
  kind: 'sef';
  entry: string;
  xslt: { archive: string; archiveSha256: string; path: string; sha256: string; additionalFiles: { path: string; to: string }[] };
}
interface Xsd extends Common {
  kind: 'xsd';
  archive: string;
  archiveSha256: string;
  copy: { from: string; to: string; files: string[] | 'all' }[];
  entries: Record<string, string>;
}
export const FRANCE_RFE_VALIDATION_SPECS: (Sef | Xsd)[] = [
  {
    version: '1.4.0.04',
    releaseDate: '2026-09-04',
    effectiveFrom: '2026-10-01',
    effectiveUntil: null,
    license: 'Apache-2.0 for FNFE XP Z12-012 rules; incorporated EN16931 material EUPL-1.2; original source notices preserved',
    upstream: 'https://github.com/fnfempe/France_RFE/tree/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
    note: 'Pinned FNFE-MPE current fatal France RFE policy; not the historical warning alternative. Strict receiving policy required by 2026-10-01. This is XML format/business-rule validation; Chorus Pro, lifecycle messages, accredited-platform exchange and tax-authority acceptance are outside this chain.',
    id: 'france-rfe-ubl-1.4.0.04',
    title: 'France RFE1.4.0.04 UBL fatal rules',
    layer: 'profile',
    syntax: 'ubl',
    kind: 'sef',
    entry: 'france-rfe-ubl-1.4.0.04.sef.json.gz',
    xslt: {
      archive: 'https://codeload.github.com/fnfempe/France_RFE/zip/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
      archiveSha256: '8728ce11486d4aa6db24c6fd653ba0c655f0fc47f8d6f69b065f2922cc595467',
      path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EN16931/2xslt/BR-FR-Flux2-Schematron-UBL.xslt',
      sha256: '5ab722085cf69301acdecbb70b38620524488c602316bfba34b00fb78deb8631',
      additionalFiles: [
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/LICENSE',
          to: 'LICENSE.txt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/README.md',
          to: 'UPSTREAM-README.md',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EN16931/2xslt/BR-FR-Flux2-Schematron-UBL.xslt',
          to: 'original-source.xslt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EN16931/schematron/BR-FR-Flux2-Schematron-UBL.sch',
          to: 'original-source.sch',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/Z.notes_&_docs/FNFE_EXPLANATORY_NOTE_V1.4.0_EN.pdf',
          to: 'publisher-explanatory-note.pdf',
        },
      ],
    },
  },
  {
    version: '1.4.0.04',
    releaseDate: '2026-09-04',
    effectiveFrom: '2026-10-01',
    effectiveUntil: null,
    license: 'Apache-2.0 for FNFE XP Z12-012 rules; incorporated EN16931 material EUPL-1.2; original source notices preserved',
    upstream: 'https://github.com/fnfempe/France_RFE/tree/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
    note: 'Pinned FNFE-MPE current fatal France RFE policy; not the historical warning alternative. Strict receiving policy required by 2026-10-01. This is XML format/business-rule validation; Chorus Pro, lifecycle messages, accredited-platform exchange and tax-authority acceptance are outside this chain.',
    id: 'france-rfe-cii-1.4.0.04',
    title: 'France RFE1.4.0.04 CII fatal rules',
    layer: 'profile',
    syntax: 'cii',
    kind: 'sef',
    entry: 'france-rfe-cii-1.4.0.04.sef.json.gz',
    xslt: {
      archive: 'https://codeload.github.com/fnfempe/France_RFE/zip/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
      archiveSha256: '8728ce11486d4aa6db24c6fd653ba0c655f0fc47f8d6f69b065f2922cc595467',
      path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/CII/EN16931/2xslt/BR-FR-Flux2-Schematron-CII.xslt',
      sha256: '02c9b97965438c1f587269a07daa5191b15efd3408f913b57bd35570f439ef10',
      additionalFiles: [
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/LICENSE',
          to: 'LICENSE.txt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/README.md',
          to: 'UPSTREAM-README.md',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/CII/EN16931/2xslt/BR-FR-Flux2-Schematron-CII.xslt',
          to: 'original-source.xslt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/CII/EN16931/schematron/BR-FR-Flux2-Schematron-CII.sch',
          to: 'original-source.sch',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/Z.notes_&_docs/FNFE_EXPLANATORY_NOTE_V1.4.0_EN.pdf',
          to: 'publisher-explanatory-note.pdf',
        },
      ],
    },
  },
  {
    version: '1.3.16',
    releaseDate: '2026-09-04',
    effectiveFrom: '2026-10-01',
    effectiveUntil: null,
    license: 'Apache-2.0 for FNFE XP Z12-012 rules; incorporated EN16931 material EUPL-1.2; original source notices preserved',
    upstream: 'https://github.com/fnfempe/France_RFE/tree/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
    note: 'Pinned FNFE-MPE current fatal France RFE policy; not the historical warning alternative. Strict receiving policy required by 2026-10-01. This is XML format/business-rule validation; Chorus Pro, lifecycle messages, accredited-platform exchange and tax-authority acceptance are outside this chain.',
    id: 'france-rfe-en16931-ubl-1.3.16',
    title: 'France RFE paired EN16931 UBL1.3.16 rules',
    layer: 'semantic',
    syntax: 'ubl',
    kind: 'sef',
    entry: 'france-rfe-en16931-ubl-1.3.16.sef.json.gz',
    xslt: {
      archive: 'https://codeload.github.com/fnfempe/France_RFE/zip/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
      archiveSha256: '8728ce11486d4aa6db24c6fd653ba0c655f0fc47f8d6f69b065f2922cc595467',
      path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EN16931/2xslt/EN16931-UBL-validation.xslt',
      sha256: '39f9d282867f1a49e7708d9e29a53da89643e1ee56f10cec1ebcf1277595fcbd',
      additionalFiles: [
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/LICENSE',
          to: 'LICENSE.txt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/README.md',
          to: 'UPSTREAM-README.md',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EN16931/2xslt/EN16931-UBL-validation.xslt',
          to: 'original-source.xslt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EN16931/schematron/EN16931-UBL-validation-preprocessed.sch',
          to: 'original-source.sch',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/Z.notes_&_docs/FNFE_EXPLANATORY_NOTE_V1.4.0_EN.pdf',
          to: 'publisher-explanatory-note.pdf',
        },
      ],
    },
  },
  {
    version: '1.4.0.04',
    releaseDate: '2026-09-04',
    effectiveFrom: '2026-10-01',
    effectiveUntil: null,
    license: 'EUPL-1.2 (original EN16931 source); FNFE repository Apache-2.0 notices retained',
    upstream: 'https://github.com/fnfempe/France_RFE/tree/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
    note: 'Pinned FNFE-MPE current fatal France RFE policy; not the historical warning alternative. Strict receiving policy required by 2026-10-01. This is XML format/business-rule validation; Chorus Pro, lifecycle messages, accredited-platform exchange and tax-authority acceptance are outside this chain.',
    id: 'france-rfe-extended-ubl-1.4.0.04',
    title: 'France RFE EXTENDED-CTC-FR UBL base rules',
    layer: 'semantic',
    syntax: 'ubl',
    kind: 'sef',
    entry: 'france-rfe-extended-ubl-1.4.0.04.sef.json.gz',
    xslt: {
      archive: 'https://codeload.github.com/fnfempe/France_RFE/zip/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
      archiveSha256: '8728ce11486d4aa6db24c6fd653ba0c655f0fc47f8d6f69b065f2922cc595467',
      path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-UBL.xslt',
      sha256: '5a30860a106680629afbbd6159d829bf5f353b835fd9eda24ea8e8e13587d4f9',
      additionalFiles: [
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/LICENSE',
          to: 'LICENSE.txt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/README.md',
          to: 'UPSTREAM-README.md',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-UBL.xslt',
          to: 'original-source.xslt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/UBL/EXTENDED-CTC-FR/schematron/EXTENDED-CTC-FR-UBL.sch',
          to: 'original-source.sch',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/Z.notes_&_docs/FNFE_EXPLANATORY_NOTE_V1.4.0_EN.pdf',
          to: 'publisher-explanatory-note.pdf',
        },
      ],
    },
  },
  {
    version: '1.4.0.04',
    releaseDate: '2026-09-04',
    effectiveFrom: '2026-10-01',
    effectiveUntil: null,
    license: 'Apache-2.0 for FNFE XP Z12-012 rules; incorporated EN16931 material EUPL-1.2; original source notices preserved',
    upstream: 'https://github.com/fnfempe/France_RFE/tree/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
    note: 'Pinned FNFE-MPE current fatal France RFE policy; not the historical warning alternative. Strict receiving policy required by 2026-10-01. This is XML format/business-rule validation; Chorus Pro, lifecycle messages, accredited-platform exchange and tax-authority acceptance are outside this chain.',
    id: 'france-rfe-extended-cii-1.4.0.04',
    title: 'France RFE EXTENDED-CTC-FR CII base rules',
    layer: 'semantic',
    syntax: 'cii',
    kind: 'sef',
    entry: 'france-rfe-extended-cii-1.4.0.04.sef.json.gz',
    xslt: {
      archive: 'https://codeload.github.com/fnfempe/France_RFE/zip/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
      archiveSha256: '8728ce11486d4aa6db24c6fd653ba0c655f0fc47f8d6f69b065f2922cc595467',
      path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/CII/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-CII.xslt',
      sha256: '7d766dadc198ec21a7238f546621113e61d2fdbaced65f263cafe368f96131d3',
      additionalFiles: [
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/LICENSE',
          to: 'LICENSE.txt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/README.md',
          to: 'UPSTREAM-README.md',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/CII/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-CII.xslt',
          to: 'original-source.xslt',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/CII/EXTENDED-CTC-FR/schematron/EXTENDED-CTC-FR-CII.sch',
          to: 'original-source.sch',
        },
        {
          path: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/Z.notes_&_docs/FNFE_EXPLANATORY_NOTE_V1.4.0_EN.pdf',
          to: 'publisher-explanatory-note.pdf',
        },
      ],
    },
  },
  {
    version: '1.4.0.04',
    releaseDate: '2026-09-04',
    effectiveFrom: '2026-10-01',
    effectiveUntil: null,
    license: 'Apache-2.0 for FNFE XP Z12-012 rules; incorporated EN16931 material EUPL-1.2; original source notices preserved',
    upstream: 'https://github.com/fnfempe/France_RFE/tree/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
    note: 'Pinned FNFE-MPE current fatal France RFE policy; not the historical warning alternative. Strict receiving policy required by 2026-10-01. This is XML format/business-rule validation; Chorus Pro, lifecycle messages, accredited-platform exchange and tax-authority acceptance are outside this chain.',
    id: 'xsd-cii-d22b-france-rfe-1.4.0.04',
    title: 'France RFE uncoupled UNCEFACT CII D22B schema',
    layer: 'schema',
    syntax: 'cii',
    kind: 'xsd',
    archive: 'https://codeload.github.com/fnfempe/France_RFE/zip/97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d',
    archiveSha256: '8728ce11486d4aa6db24c6fd653ba0c655f0fc47f8d6f69b065f2922cc595467',
    copy: [
      {
        from: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/FNFE_RFE_INVOICE/CII/1xsd-CII_D22B_uncoupled/',
        to: '',
        files: 'all',
      },
      {
        from: 'France_RFE-97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d/',
        to: '',
        files: ['LICENSE', 'README.md'],
      },
    ],
    entries: {
      CrossIndustryInvoice: 'CrossIndustryInvoice_100pD22B.xsd',
    },
  },
];
