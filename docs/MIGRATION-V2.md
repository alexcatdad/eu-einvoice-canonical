# Migrating to v2

Version 2.0.0 focuses the core library on invoice ingestion, detection, canonical conversion, source validation, signature verification, provenance and structural understanding. Canonical JSON remains compatible with the `v1` schemas and HTTP response contracts.

## Removed business operations

Accounting journals, account mappings (including the BAS example), SIE/CSV bookkeeping exports, purchase-order and goods-receipt matching, and cross-document duplicate detection are removed. Their exported functions and types, `matching` namespace, CLI commands (`export`, `match`, `duplicates`), MCP tools (`check_duplicates`, `match_purchase_order`) and website bookkeeping download have no replacement in this package. Downstream applications can consume canonical JSON to implement their own business workflows.

Removed imports include `buildJournalEntry`, `parseAccountMapping`, `BAS_EXAMPLE_MAPPING`, `JournalError`, `toSie4`, `journalToCsv`, `journalToJson`, `encodeCp437`, `CSV_COLUMNS`, `DuplicateIndex`, and their supporting types. Every member of the former `matching` namespace, including `matchInvoice` and `parseOrder`, is removed.

Invoice order references, receipt references, credit-note links, exact amounts, country extensions and source metadata remain part of the canonical model. Algorithmic line classification and relationship inference remain available.

## Optional consumers use separate imports

Import conversion, source validation, relation analysis, snapshot parsing and canonical types from the core entry point as before:

```ts
import { convert, parseSnapshot, validateSource, type CanonicalInvoice } from 'eu-einvoice-canonical';
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

The existing `eu-einvoice-canonical/react` and `eu-einvoice-canonical/server` imports remain available. MCP is available through `eu-einvoice-canonical/mcp`. The `einvoice render`, `write`, `serve` and `mcp` commands remain optional consumers of the conversion API. Importing the root entry point does not load these consumers. The MCP SDK is an optional peer (`@modelcontextprotocol/sdk@1.32.1`); MCP consumers must install it. Zod remains a core dependency for annotation contracts. For a core-only Bun install use `bun install --production --omit peer`, because Bun otherwise installs optional peers automatically. Separate entry points provide isolation without introducing a monorepo.

Published entry points continue to use compiled JavaScript and TypeScript declarations, with Node 20+ support.

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

The canonical model, all parsers, source validation and qualification infrastructure, provenance, unmapped-field reporting, algorithmic line roles and relationships, confidence and evidence, annotation contracts, labelled datasets and evaluation infrastructure are preserved. The Astro/Starlight site, React converter, source-validation browser workers, annotation input export and annotation import validation remain available. LLM execution remains research tooling rather than part of core conversion.
