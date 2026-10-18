/** Exact official legacy XSD artifacts. Imported by the shared builder; no network work on import. */
interface LegacyXsdSpec {
  kind: 'xsd';
  id: string;
  title: string;
  layer: 'schema';
  syntax: string;
  version: string;
  releaseDate: string;
  effectiveFrom: string;
  effectiveUntil: null;
  license: string;
  upstream: string;
  note: string;
  entries: Record<string, string>;
  archive?: string;
  archiveSha256?: string;
  copy?: { from: string; to: string; files: string[] | 'all' }[];
  fetch?: { url: string; sha256: string; to: string; replace?: [string, string][] }[];
}
export const LEGACY_XSD_SPECS: LegacyXsdSpec[] = [
  {
    kind: 'xsd',
    id: 'xsd-finvoice-1.3',
    title: 'finvoice 1.3 XSD',
    layer: 'schema',
    syntax: 'finvoice',
    version: '1.3',
    releaseDate: '2011-03-28',
    effectiveFrom: '2011-03-28',
    effectiveUntil: null,
    license: 'Finance Finland: all materials on the official Finvoice standard page are freely usable.',
    upstream: 'https://file.finanssiala.fi/finvoice/FI/Finvoice.xsd',
    note: 'Official exact-version XSD, bytes preserved. Release date from schema header.',
    entries: {
      Finvoice: 'Finvoice1.3.xsd',
    },
    fetch: [
      {
        url: 'https://file.finanssiala.fi/finvoice/FI/Finvoice.xsd',
        sha256: 'bbaf2a0ab1ed9c766c56adcc7de93ba81dbacd0199bb9e1e774f0dd1713b666c',
        to: 'Finvoice1.3.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-finvoice-2.0',
    title: 'finvoice 2.0 XSD',
    layer: 'schema',
    syntax: 'finvoice',
    version: '2.0',
    releaseDate: '2012-10-31',
    effectiveFrom: '2012-10-31',
    effectiveUntil: null,
    license: 'Finance Finland: all materials on the official Finvoice standard page are freely usable.',
    upstream: 'https://file.finanssiala.fi/finvoice/Finvoice.xsd',
    note: 'Official exact-version XSD, bytes preserved. Release date from schema header.',
    entries: {
      Finvoice: 'Finvoice2.0.xsd',
    },
    fetch: [
      {
        url: 'https://file.finanssiala.fi/finvoice/Finvoice.xsd',
        sha256: '997c160d05289a30e93424d861abaf6c43cf35a21282bc988855434b99d56fae',
        to: 'Finvoice2.0.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-finvoice-2.01',
    title: 'finvoice 2.01 XSD',
    layer: 'schema',
    syntax: 'finvoice',
    version: '2.01',
    releaseDate: '2013-04-01',
    effectiveFrom: '2013-04-01',
    effectiveUntil: null,
    license: 'Finance Finland: all materials on the official Finvoice standard page are freely usable.',
    upstream: 'https://file.finanssiala.fi/finvoice/Finvoice2.01.xsd',
    note: 'Official exact-version XSD, bytes preserved. Release date from schema header.',
    entries: {
      Finvoice: 'Finvoice2.01.xsd',
    },
    fetch: [
      {
        url: 'https://file.finanssiala.fi/finvoice/Finvoice2.01.xsd',
        sha256: '7165e571e12dba404b77edd8b7660f9960560883e8d82a6257a140f478e9adc6',
        to: 'Finvoice2.01.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-ebinterface-4.0',
    title: 'ebinterface 4.0 XSD',
    layer: 'schema',
    syntax: 'ebinterface',
    version: '4.0',
    releaseDate: '2026-10-18',
    effectiveFrom: '2026-10-18',
    effectiveUntil: null,
    license:
      'No licence text in files; official AUSTRIAPRO development repository, same preservation policy as existing ebInterface bundles (validation/NOTICE).',
    upstream:
      'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p0/Invoice.xsd',
    note: 'Pinned AUSTRIAPRO development commit; vendoring date is not an official release date. XMLDSIG remote import rewritten to local copy.4.0 extension schemaLocation URIs rewritten to matching local schema files.',
    entries: {
      Invoice: 'Invoice.xsd',
    },
    fetch: [
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p0/Invoice.xsd',
        sha256: 'ff20d31f28a293c71eabb549c2939e5018d79427a7fce8b63dacdf564af587b9',
        to: 'Invoice.xsd',
        replace: [
          ['http://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd', 'xmldsig-core-schema.xsd'],
          ['schemaLocation="http://www.ebinterface.at/schema/4p0/extensions/ext"', 'schemaLocation="ebInterfaceExtension.xsd"'],
        ],
      },
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p0/ebInterfaceExtension.xsd',
        sha256: '3362ed5e7a35a10370a68ced5e1e2f0cfc2c4af6a098ad763450ff5ab14d43c0',
        to: 'ebInterfaceExtension.xsd',
        replace: [
          ['schemaLocation="http://www.ebinterface.at/schema/4p0/extensions/sv"', 'schemaLocation="ext/ebInterfaceExtension_SV.xsd"'],
        ],
      },
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p0/ext/ebInterfaceExtension_SV.xsd',
        sha256: '4df4e4b23807aaf447a0896aca3e24943fce73164bc0b789fd899b6ef8d22390',
        to: 'ext/ebInterfaceExtension_SV.xsd',
      },
      {
        url: 'https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd',
        sha256: '35cf8197da812c85e40d57891b35c94187569ed474a2dac813ce5090dafcd35c',
        to: 'xmldsig-core-schema.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-ebinterface-4.1',
    title: 'ebinterface 4.1 XSD',
    layer: 'schema',
    syntax: 'ebinterface',
    version: '4.1',
    releaseDate: '2026-10-18',
    effectiveFrom: '2026-10-18',
    effectiveUntil: null,
    license:
      'No licence text in files; official AUSTRIAPRO development repository, same preservation policy as existing ebInterface bundles (validation/NOTICE).',
    upstream:
      'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p1/Invoice.xsd',
    note: 'Pinned AUSTRIAPRO development commit; vendoring date is not an official release date. XMLDSIG remote import rewritten to local copy.',
    entries: {
      Invoice: 'Invoice.xsd',
    },
    fetch: [
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p1/Invoice.xsd',
        sha256: 'd1ae89037b36fbbaea351ab621dcde0d6cc6f61b645ec182748fe865815e3b9c',
        to: 'Invoice.xsd',
        replace: [['http://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd', 'xmldsig-core-schema.xsd']],
      },
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p1/ebInterfaceExtension.xsd',
        sha256: '1e98ec966d9c20bd4ea4ac7112d3fe1a9a183e04e601af214e6340f10a62700e',
        to: 'ebInterfaceExtension.xsd',
      },
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p1/ext/ebInterfaceExtension_SV.xsd',
        sha256: '2785c02f38494d37603fd4f4ad3be68f67747ff7f9a2f0e95bc82f738f40b0a4',
        to: 'ext/ebInterfaceExtension_SV.xsd',
      },
      {
        url: 'https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd',
        sha256: '35cf8197da812c85e40d57891b35c94187569ed474a2dac813ce5090dafcd35c',
        to: 'xmldsig-core-schema.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-ebinterface-4.2',
    title: 'ebinterface 4.2 XSD',
    layer: 'schema',
    syntax: 'ebinterface',
    version: '4.2',
    releaseDate: '2026-10-18',
    effectiveFrom: '2026-10-18',
    effectiveUntil: null,
    license:
      'No licence text in files; official AUSTRIAPRO development repository, same preservation policy as existing ebInterface bundles (validation/NOTICE).',
    upstream:
      'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p2/Invoice.xsd',
    note: 'Pinned AUSTRIAPRO development commit; vendoring date is not an official release date. XMLDSIG remote import rewritten to local copy.',
    entries: {
      Invoice: 'Invoice.xsd',
    },
    fetch: [
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p2/Invoice.xsd',
        sha256: '2cf9caa591be1ab89c721f6d46e762ab0410c995b1f17b24d1a74c328eecb673',
        to: 'Invoice.xsd',
        replace: [['http://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd', 'xmldsig-core-schema.xsd']],
      },
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p2/ebInterfaceExtension.xsd',
        sha256: 'd737f5290827c941fbb23f2f7d305627a0a102332d0231ec734695c506f3d5e9',
        to: 'ebInterfaceExtension.xsd',
      },
      {
        url: 'https://raw.githubusercontent.com/austriapro/ebinterface-standards/f7e4e4ec8778b7da2bc3468ed976a396fa8b6b29/schemas/ebInterface4p2/ext/ebInterfaceExtension_SV.xsd',
        sha256: '2c19756e0a76295c5d04365334dcd46a3e9c5146a118599adc5b17a14545a7af',
        to: 'ext/ebInterfaceExtension_SV.xsd',
      },
      {
        url: 'https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd',
        sha256: '35cf8197da812c85e40d57891b35c94187569ed474a2dac813ce5090dafcd35c',
        to: 'xmldsig-core-schema.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-facturae-3.0',
    title: 'Facturae 3.0 XSD',
    layer: 'schema',
    syntax: 'facturae',
    version: '3.0',
    releaseDate: '2026-10-18',
    effectiveFrom: '2026-10-18',
    effectiveUntil: null,
    license:
      'No licence text in the files; published by the issuing authority for implementers to validate against (see validation/NOTICE)',
    upstream: 'https://www.facturae.gob.es/formato/versiones-anteriores',
    note: 'Official archived schema. Dates are vendoring metadata, not a legal mandatory-use date. XMLDSIG schemaLocation localized.',
    entries: {
      Facturae: 'Facturae.xsd',
    },
    fetch: [
      {
        url: 'https://www.facturae.gob.es/content/dam/facturae/formato/versiones-anteriores/b%29-versi%C3%B3n-3-0/Facturae30.xml',
        sha256: '73720b3eb0fec580820e411b2640a10badb121ecfccbeeb1bad48af8306dff7a',
        to: 'Facturae.xsd',
        replace: [['http://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd', 'xmldsig-core-schema.xsd']],
      },
      {
        url: 'https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd',
        sha256: '35cf8197da812c85e40d57891b35c94187569ed474a2dac813ce5090dafcd35c',
        to: 'xmldsig-core-schema.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-facturae-3.1',
    title: 'Facturae 3.1 XSD',
    layer: 'schema',
    syntax: 'facturae',
    version: '3.1',
    releaseDate: '2026-10-18',
    effectiveFrom: '2026-10-18',
    effectiveUntil: null,
    license:
      'No licence text in the files; published by the issuing authority for implementers to validate against (see validation/NOTICE)',
    upstream: 'https://www.facturae.gob.es/formato/versiones-anteriores',
    note: 'Official archived schema. Dates are vendoring metadata, not a legal mandatory-use date. XMLDSIG schemaLocation localized.',
    entries: {
      Facturae: 'Facturae.xsd',
    },
    fetch: [
      {
        url: 'https://www.facturae.gob.es/content/dam/facturae/formato/versiones-anteriores/a%29-versi%C3%B3n-3-1/Facturaev31.xml',
        sha256: 'b7405dfc0ddbff9fc0361f805dd606071c7515cc072a09d5456daa8fb62b240e',
        to: 'Facturae.xsd',
        replace: [['http://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd', 'xmldsig-core-schema.xsd']],
      },
      {
        url: 'https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd',
        sha256: '35cf8197da812c85e40d57891b35c94187569ed474a2dac813ce5090dafcd35c',
        to: 'xmldsig-core-schema.xsd',
      },
    ],
  },
  {
    kind: 'xsd',
    id: 'xsd-ubl-2.0',
    title: 'OASIS UBL 2.0 XSD Invoice/CreditNote',
    layer: 'schema',
    syntax: 'ubl',
    version: '2.0',
    releaseDate: '2006-12-12',
    effectiveFrom: '2006-12-12',
    effectiveUntil: null,
    license: 'OASIS IPR policy: original copyright and permission notices retained in every XSD file.',
    upstream: 'https://docs.oasis-open.org/ubl/os-UBL-2.0/',
    note: 'Exact original OASIS Standard2.0 archive, without later Errata01. Common code-list schemas are included unchanged. National OIOUBL business rules are separate.',
    entries: {
      Invoice: 'maindoc/UBL-Invoice-2.0.xsd',
      CreditNote: 'maindoc/UBL-CreditNote-2.0.xsd',
    },
    archive: 'https://docs.oasis-open.org/ubl/os-UBL-2.0.zip',
    archiveSha256: 'd3eb3356d425bcf16c786d705ebaed99d7da8e581e1a0bcefc4855d734c0ddc9',
    copy: [
      {
        from: 'os-UBL-2.0/xsd/common/',
        to: 'common/',
        files: 'all',
      },
      {
        from: 'os-UBL-2.0/xsd/maindoc/',
        to: 'maindoc/',
        files: ['UBL-Invoice-2.0.xsd', 'UBL-CreditNote-2.0.xsd'],
      },
    ],
  },
];
