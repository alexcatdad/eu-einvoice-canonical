/** Official SAT core/datatype/catalog/Timbre schema closures with a local non-normative import driver. */
interface CfdiXsdSpec {
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
  fetch: { url: string; sha256: string; to: string; replace?: [string, string][] }[];
  generated: Record<string, string>;
}
export const CFDI_XSD_SPECS: CfdiXsdSpec[] = [
  {
    kind: 'xsd',
    id: 'xsd-cfdi-3.3',
    title: 'SAT CFDI3.3 plus TimbreFiscalDigital1.1 XSD',
    layer: 'schema',
    syntax: 'cfdi',
    version: '3.3',
    releaseDate: '2026-10-18',
    effectiveFrom: '2026-10-18',
    effectiveUntil: null,
    license:
      'SAT official published XSDs; no explicit redistribution license text found. Source comments and documentation retained; rights qualification remains explicit in validation/NOTICE.',
    upstream: 'https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
    note: 'Pinned vendoring snapshot, including current catalog definitions; dates are acquisition metadata, not mandatory-use dates. Only core and TimbreFiscalDigital1.1 are covered. Other complements/Addenda require unavailable schemas; SAT business controls, PAC/authority verification and signature trust remain separate.',
    entries: {
      Comprobante: 'driver.xsd',
    },
    fetch: [
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/3/cfdv33.xsd',
        sha256: '9fab804ebd9c532ddd59a74b23a3fa2b5d0d1f9046360b05efcef72206f01fd0',
        to: 'cfdv33.xsd',
        replace: [
          ['http://www.sat.gob.mx/sitio_internet/cfd/catalogos/catCFDI.xsd', 'catCFDI.xsd'],
          ['http://www.sat.gob.mx/sitio_internet/cfd/tipoDatos/tdCFDI/tdCFDI.xsd', 'tdCFDI.xsd'],
        ],
      },
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/catalogos/catCFDI.xsd',
        sha256: '6c58936cb77576f839a4d7915953ceaf252b9eb9319f9458fe5bb67ae2bb0bb1',
        to: 'catCFDI.xsd',
      },
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/tipoDatos/tdCFDI/tdCFDI.xsd',
        sha256: 'b3b81fe4017b95d5477f23a32f47e8b0571683cfddfff1330508c75e02b504cd',
        to: 'tdCFDI.xsd',
      },
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd',
        sha256: 'fb3d061fe9914500bef8beb3ea2e8722ee8a8224fa3af63643877a64c0ea05f7',
        to: 'TimbreFiscalDigitalv11.xsd',
        replace: [['http://www.sat.gob.mx/sitio_internet/cfd/tipoDatos/tdCFDI/tdCFDI.xsd', 'tdCFDI.xsd']],
      },
    ],
    generated: {
      'driver.xsd':
        '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Local validation driver: original SAT core and Timbre components are imported, not redefined. -->\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:import namespace="http://www.sat.gob.mx/cfd/3" schemaLocation="cfdv33.xsd"/><xs:import namespace="http://www.sat.gob.mx/TimbreFiscalDigital" schemaLocation="TimbreFiscalDigitalv11.xsd"/></xs:schema>\n',
    },
  },
  {
    kind: 'xsd',
    id: 'xsd-cfdi-4.0',
    title: 'SAT CFDI4.0 plus TimbreFiscalDigital1.1 XSD',
    layer: 'schema',
    syntax: 'cfdi',
    version: '4.0',
    releaseDate: '2026-10-18',
    effectiveFrom: '2026-10-18',
    effectiveUntil: null,
    license:
      'SAT official published XSDs; no explicit redistribution license text found. Source comments and documentation retained; rights qualification remains explicit in validation/NOTICE.',
    upstream: 'https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
    note: 'Pinned vendoring snapshot, including current catalog definitions; dates are acquisition metadata, not mandatory-use dates. Only core and TimbreFiscalDigital1.1 are covered. Other complements/Addenda require unavailable schemas; SAT business controls, PAC/authority verification and signature trust remain separate.',
    entries: {
      Comprobante: 'driver.xsd',
    },
    fetch: [
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
        sha256: '2489b5b535f5cbc6a6c2db6132620de1833f85372512d01deea62880e700e276',
        to: 'cfdv40.xsd',
        replace: [
          ['http://www.sat.gob.mx/sitio_internet/cfd/catalogos/catCFDI.xsd', 'catCFDI.xsd'],
          ['http://www.sat.gob.mx/sitio_internet/cfd/tipoDatos/tdCFDI/tdCFDI.xsd', 'tdCFDI.xsd'],
        ],
      },
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/catalogos/catCFDI.xsd',
        sha256: '6c58936cb77576f839a4d7915953ceaf252b9eb9319f9458fe5bb67ae2bb0bb1',
        to: 'catCFDI.xsd',
      },
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/tipoDatos/tdCFDI/tdCFDI.xsd',
        sha256: 'b3b81fe4017b95d5477f23a32f47e8b0571683cfddfff1330508c75e02b504cd',
        to: 'tdCFDI.xsd',
      },
      {
        url: 'https://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd',
        sha256: 'fb3d061fe9914500bef8beb3ea2e8722ee8a8224fa3af63643877a64c0ea05f7',
        to: 'TimbreFiscalDigitalv11.xsd',
        replace: [['http://www.sat.gob.mx/sitio_internet/cfd/tipoDatos/tdCFDI/tdCFDI.xsd', 'tdCFDI.xsd']],
      },
    ],
    generated: {
      'driver.xsd':
        '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Local validation driver: original SAT core and Timbre components are imported, not redefined. -->\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:import namespace="http://www.sat.gob.mx/cfd/4" schemaLocation="cfdv40.xsd"/><xs:import namespace="http://www.sat.gob.mx/TimbreFiscalDigital" schemaLocation="TimbreFiscalDigitalv11.xsd"/></xs:schema>\n',
    },
  },
];
