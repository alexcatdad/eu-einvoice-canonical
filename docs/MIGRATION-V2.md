# Migrating to v2

Version 2.0.0 focuses the core library on invoice ingestion, detection, canonical conversion, source validation, signature verification, provenance and structural understanding. Canonical JSON remains compatible with the `v1` schemas and HTTP response contracts.

## Removed business operations

Accounting journals, account mappings (including the BAS example), SIE/CSV bookkeeping exports, purchase-order and goods-receipt matching, and cross-document duplicate detection are removed. Their exported functions and types, `matching` namespace, CLI commands (`export`, `match`, `duplicates`), MCP tools (`check_duplicates`, `match_purchase_order`) and website bookkeeping download have no replacement in this package. Downstream applications can consume canonical JSON to implement their own business workflows.

Invoice order references, receipt references, credit-note links, exact amounts, country extensions and source metadata remain part of the canonical model. Algorithmic line classification and relationship inference remain available.

## Optional consumers use separate imports

Import conversion, validation types, relation analysis, snapshot parsing and canonical types from the core entry point as before:

```ts
import { convert, parseSnapshot, type CanonicalInvoice } from 'eu-einvoice-canonical';
```

Move rendering and XML-generation imports from the root to their optional entry points:

```ts
import {
  escapeHtml,
  renderHtml,
  renderPdf,
  type RenderHtmlOptions,
  type RenderPdfOptions,
} from 'eu-einvoice-canonical/render';
import {
  toUbl,
  toCii,
  WriterError,
  type UblOptions,
  type CiiOptions,
  type WriterProfile,
} from 'eu-einvoice-canonical/writers';
```

The existing `eu-einvoice-canonical/react` and `eu-einvoice-canonical/server` imports remain available. MCP is available through `eu-einvoice-canonical/mcp`. Its SDK and Zod are optional peers: consumers that use MCP must install `@modelcontextprotocol/sdk@1.32.1` and `zod@4.6.7` (repository development installs already include them). The `einvoice render`, `write`, `serve` and `mcp` commands remain optional consumers of the conversion API. Importing the root entry point does not load these consumers. They remain in this package because separate entry points and lazy CLI imports provide isolation without moving working code into a monorepo.

For a core-only Bun installation, use `bun install --production --omit peer`; Bun otherwise installs optional peers automatically. Add the MCP or React peers explicitly when using those consumers. The HTTP Docker image omits peers. `pdf-lib` remains a core dependency for PDF invoice attachment ingestion.

## Trust-list updates are a maintenance operation

Move `loadTrustLists`, `LOTL_URL` and `LoadOptions` imports to:

```ts
import { loadTrustLists, LOTL_URL, type LoadOptions } from 'eu-einvoice-canonical/trust-lists';
```

Replace `einvoice trust-lists update` with the separate maintenance executable:

```sh
einvoice-trust-lists update --out snapshot.json
```

Retain the snapshot for reproducible verification. Parsing and using it does not require external requests:

```ts
const euTrust = parseSnapshot(snapshotText);
const result = await convert(bytes, 'invoice.xml', undefined, { euTrust });
```

The browser converter uses its published snapshot when EU trust checking is enabled. It no longer acquires live national trust lists. Signature verification stays optional, and conversion and validation never refresh snapshots automatically.

## Preserved output-quality research

The canonical model, all parsers, source validation, provenance, unmapped-field reporting, algorithmic line roles and relationships, confidence and evidence, LLM annotation contracts, labelled datasets and evaluation infrastructure are preserved. The browser converter and research playground remain available. LLM execution remains research tooling rather than part of core conversion.
