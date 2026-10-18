# Canonical line annotations

This example interprets invoice lines using a selected view of the library's canonical JSON. Names, descriptions, notes, identifiers and financial context remain separate. The model returns annotations for supplied items, descriptive lines, adjustments and their subjects. The canonical invoice stays unchanged.

Annotations remain inferred and unreviewed even after validation. Unknown roles and unresolved subjects are independent. Related installation and goods remain separate supplied items, potentially with different financial classifications. This example does not merge lines, calculate group totals or replace the existing `lineRoles` / `relations` API.

## Prompts, settings and examples

These files are included in the Pages deployment and copied unchanged from the source example:

- [System prompt](https://alexcatdad.github.io/eu-einvoice-canonical/examples/line-annotations/system-prompt.txt)
- [Model settings in HuJSON](https://alexcatdad.github.io/eu-einvoice-canonical/examples/line-annotations/config.hujson)
- [Three teaching examples in HuJSON](https://alexcatdad.github.io/eu-einvoice-canonical/examples/line-annotations/examples.hujson)
- [Structured output schema in HuJSON](https://alexcatdad.github.io/eu-einvoice-canonical/examples/line-annotations/response-format.hujson)
- [Complete synthetic canonical invoice](https://alexcatdad.github.io/eu-einvoice-canonical/examples/line-annotations/invoice.hujson)
- [Expected synthetic annotations](https://alexcatdad.github.io/eu-einvoice-canonical/examples/line-annotations/expected.hujson)

The [source example](https://github.com/alexcatdad/eu-einvoice-canonical/tree/main/examples/line-annotations) contains the runnable consumer and HuJSON helper. The existing browser converter and line-labelling evaluation still use their original browser-model integration; these downloads are a separate consumer reference.

## Run the saved example

Requires Bun, repository dependencies (`bun install`) and Go 1.26 or later. Go is used only by this example's HuJSON loader, not by the TypeScript library.

```sh
# Downloads the pinned example-only Go dependency once.
go -C examples/line-annotations/hujson mod download

# Uses saved synthetic output; makes no model request.
bun examples/line-annotations/run.ts

# Checks HuJSON parsing, the canonical sample, examples and request/response handling.
bun scripts/check-line-annotations.ts
```

`invoice.hujson` is a complete synthetic canonical invoice. `examples.hujson` contains abbreviated teaching inputs and expected annotations; these excerpts are not complete canonical invoices. `expected.hujson` supplies the saved output for the default run. `config.hujson` contains model settings. `response-format.hujson` shows the structured-output request, generated from the exported schema and checked for agreement by the integration check.

The human-edited assets use [Tailscale HuJSON](https://github.com/tailscale/hujson): JSON with comments and trailing commas. A small Go helper uses the pinned upstream `hujson.Standardize` implementation. Comments are stripped before parsing, and all model messages and wire responses use standard JSON. The loader does not execute instructions in invoice text.

## Optional model request

Choose your own provider and full chat-completions endpoint. Set `LLM_CHAT_COMPLETIONS_URL` and, if needed, `LLM_API_KEY` in your environment, then explicitly request one call:

```sh
bun examples/line-annotations/run.ts --send
```

Only the selected canonical input, prompt and optional teaching examples are sent. The example makes no automatic retries or repair requests. It requires one completed, non-refused response and rejects truncation. A successful result includes input and request hashes alongside the annotations, with `method: "model"` and `status: "unreviewed"`. The default demonstration instead reports `method: "saved-example"`.

The Mistral settings are sample-specific: high reasoning, temperature 0.7 and top_p 0.95. See the [model's recommended settings](https://huggingface.co/mistralai/Mistral-Medium-3.5-128B#recommended-settings). Other providers may require different settings or request adapters. `includeExamples` toggles the three teaching pairs. Nothing in the library chooses a provider or manages credentials.

## Use the library functions

```ts
import {
  buildLineAnnotationInput,
  LINE_ANNOTATION_SCHEMA,
  validateLineAnnotations,
} from 'eu-einvoice-canonical';

// invoice comes from convert(), or has passed the canonical JSON Schema.
const input = buildLineAnnotationInput(invoice);

// Supply input as JSON to your provider with the system prompt and schema.
// Check transport success, refusal and completion status before validation.
const checked = validateLineAnnotations(modelResponse, input);
if (!checked.ok) {
  console.error(checked.issues);
} else {
  // Keep these separately from invoice; shape validity is not semantic correctness.
  const annotations = checked.value;
}
```

`buildLineAnnotationInput` copies the selected fields and rejects unsupported scope with `AnnotationInputError.issues`. It preserves decimal strings, source signs, absent optional values, line order and separate names/descriptions/notes. It uses `purchaseOrderRef` and `invoicePeriod`, retains related header references, and includes mapper derivations, value origins and warning field references for selected canonical paths. Legacy relation heuristics and their warnings are excluded. Raw XML, unmapped source payloads, XPath maps, attachments, party and payment details are not part of this view; the original invoice retains them.

This is a deliberately limited reference: ordinary type-380 invoices with nonempty, unique top-level line IDs. It rejects credit notes, corrective documents, preceding-invoice references, nested lines, national extensions, other taxes and withholdings. A text-only line with a substituted zero is accepted only when its `TEXT_LINE` warning identifies the canonical amount field and that value is marked `defaulted`; older untraced output remains rejected. The source line ID `invoice` is reserved by the compact target syntax and is rejected. These are example boundaries, not limitations of the library's conversion support. Unsupported inputs need an explicit policy before extending the example.

Warnings are forwarded only when their canonical `field` belongs to the selected input. Warnings about omitted fields, or without a canonical field reference, remain on the original invoice; their messages can contain payment, party or attachment details and are not sent by this consumer.

## Canonical evidence metadata

`source.valueOrigins` is an optional map from canonical JSON Pointers to origin states. It is available without enabling XML provenance. Values and line order remain unchanged.

```json
{
  "valueOrigins": {
    "/lines/0/netAmount": "defaulted",
    "/lines/1/netAmount": "source",
    "/totals/taxExclusive": "derived"
  }
}
```

- `source`: the instrumented parser read the value from the source; ordinary decimal normalization still applies.
- `derived`: the mapper produced the value. Consult the corresponding `source.derived` explanation; older derivations can include assumptions as well as calculations and code mappings.
- `defaulted`: an explicitly identified fallback or placeholder. A substituted zero is not evidence of a free item or of a descriptive role.
- No entry: origin is unrecorded. Never infer that it was source-supplied, and do not fill absent values with zero.

Coverage is intentionally explicit: line net amounts in UBL, CII, Svefaktura and ZUGFeRD 1; Finvoice sub-line amounts; KSeF RR line amounts; assumed document types in UBL, CII and Svefaktura; and existing derivation records that identify surviving scalar fields. Collection-level and descriptive derivation paths remain explanatory notes. Other fields may have no origin entry. `source.warnings[].field`, when supplied, identifies the affected canonical value separately from an optional source `path`.

| Research requirement | Consumer contract |
|---|---|
| Names, descriptions, notes, references and financial context | Already canonical; retained as separate fields in the selected input |
| Explicit zero versus an absent amount represented as zero | Origin metadata distinguishes these without changing amounts |
| Calculated or otherwise mapper-produced values | Origin plus existing derivation explanations |
| Warnings associated with a particular value | Optional canonical `field` reference, retained for selected fields |
| Missing or unrecorded evidence | Remains missing or unrecorded; no source-origin assumption |
| Arithmetic matches, repeated identifiers and adjacency | Not promoted to commercial roles or subject relationships |

The schema additions are optional and preserve the v1 contract for existing JSON consumers. Their presence establishes data provenance, not model accuracy or commercial correctness.

## Output meanings

The model returns `{ "id": "invoice-id", "lines": [{ "id": "line-id", "kind": "goods", "targets": [] }] }`.

| `kind` | Interpretation |
|---|---|
| `goods`, `labour`, `freight`, `other_item` | An independent supplied item with the indicated category |
| `item_unknown` | An independent item whose category is unresolved |
| `descriptor` | Information describing an item or the invoice |
| `adjustment` | An amount changing another price or the invoice value |
| `unknown` | Insufficient evidence to decide the commercial role |

| `targets` | Meaning |
|---|---|
| `[]` | No established subject relationship and no reference requiring resolution |
| `null` | A relationship is indicated but its subject is unresolved |
| `["7", "19"]` | Applies to both named source lines, not one unknown alternative |
| `["invoice"]` | Expressly whole-invoice scope |

A known role can have an unresolved subject, and an unknown role can have a known subject. If deciding the role requires unavailable contractual terms, the prompt asks for `unknown`. The validator cannot determine whether a plausible role is factually supported; that remains a semantic decision requiring evaluation or review.

The strict schema checks the output shape. `validateLineAnnotations` additionally requires unchanged invoice ID and every line exactly once in order; it rejects self-links, unknown or duplicate targets, mixed whole-invoice/line scope and empty targets for descriptors or adjustments. A failure returns diagnostics for the entire response, never silently repaired or partially accepted annotations.

## Evidence and limits

The prompt and teaching examples were developed with synthetic invoice cases. This integration additionally preserves header and source-evidence fields and explicitly states the missing-contract policy. Those changes have local contract checks but have not been evaluated in another model benchmark. The saved example is illustrative, not a production accuracy guarantee. In particular, repeated model agreement and structurally valid output do not establish that a commercial interpretation is correct.
