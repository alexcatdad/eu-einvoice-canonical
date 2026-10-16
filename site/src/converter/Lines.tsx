/** The Lines sheet: line roles and relations, and the optional language model that labels what the rules leave open. */
import type { CanonicalInvoice, Line, LineRelation, LineRole } from '../../../src/index.ts';
import { t } from '../../i18n';
import { ENGINES, type EngineSpec } from '../../model';
import { Button } from '../components/ui/button';
import { Html } from './i18n';

const ROLE_LABEL: Partial<Record<LineRole, string>> = {
  surcharge: 'role.surcharge',
  discount: 'role.discount',
  freight: 'role.freight',
  labour: 'role.labour',
  other: 'role.other',
};
/** Message keys for relations seen from the line that holds them ("on line 3"). Percentage types also have a variant with the rate. */
const RELATION_ON: Record<string, [plain: string, withRate?: string]> = {
  markup: ['rel.markupOn', 'rel.markupRateOn'],
  discount: ['rel.discountOn', 'rel.discountRateOn'],
  'allowance-base': ['rel.allowanceBaseOn'],
  'note-reference': ['rel.noteReferenceOn'],
  'same-item': ['rel.sameItemOn'],
  'same-order-line': ['rel.sameOrderLineOn'],
};

const Review = () => (
  <span className="review" title={t('rel.reviewTitle')}>
    {t('rel.review')}
  </span>
);

/** Structural rules (no confidence) are certain; everything else short of 'proven' is a hint. */
const needsReview = (r: LineRelation) => r.method === 'model' || (r.confidence !== undefined && r.confidence !== 'proven');

function LineRow({ inv, line: l, under }: { inv: CanonicalInvoice; line: Line; under: Set<string> }) {
  const role = inv.lineRoles?.[l.id];
  const rels = inv.relations ?? [];
  const descriptor = role === 'heading' || role === 'description';
  const derivedRole = inv.source.derived.some((d) => d.field === `/lineRoles/${l.id}`);
  const notes: { text: string; review: boolean }[] = [];
  for (const r of rels) {
    if (r.type === 'heading') continue;
    if (r.from === l.id) {
      const [plain, withRate] = RELATION_ON[r.type] ?? ['rel.sameItemOn'];
      const key = r.rate !== undefined && withRate ? withRate : plain;
      notes.push({ text: t(key, { rate: r.rate ?? '', to: r.to.join(', ') }), review: needsReview(r) });
    } else if (r.to.includes(l.id) && (r.type === 'markup' || r.type === 'discount')) {
      const key = `rel.${r.type}${r.rate !== undefined ? 'Rate' : ''}In`;
      notes.push({ text: t(key, { rate: r.rate ?? '', from: r.from }), review: needsReview(r) });
    }
  }
  const byModel = derivedRole || rels.some((r) => r.method === 'model' && (r.from === l.id || r.to.includes(l.id)));
  const cls = [
    byModel ? 'by-model' : '',
    descriptor ? 'descriptor' : '',
    role === 'description' || under.has(l.id) ? 'under' : '',
    role === 'surcharge' || role === 'discount' ? 'adjusts' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const roleKey = role ? ROLE_LABEL[role] : undefined;
  return (
    <tr className={cls || undefined}>
      <td className="hide-narrow">{l.id}</td>
      <td className="item">
        {l.item.name || l.item.description || t('line.noName')}
        {!descriptor && l.vat && (
          <span className="sub">
            {l.vat.rate !== undefined
              ? t('line.vatRate', { code: l.vat.categoryCode, rate: l.vat.rate })
              : t('line.vat', { code: l.vat.categoryCode })}
          </span>
        )}
        {notes.map((n) => (
          <span className="sub relation" key={n.text}>
            {n.text}
            {n.review && (
              <>
                {' '}
                <Review />
              </>
            )}
          </span>
        ))}
        {roleKey && !notes.length && (
          <span className="sub">
            {t(roleKey)}
            {derivedRole && (
              <>
                {' '}
                <Review />
              </>
            )}
          </span>
        )}
      </td>
      <td className="num">
        {descriptor ? null : l.quantity !== undefined ? (
          `${l.quantity} ${l.unitText ?? l.unitCode ?? ''}`
        ) : (
          <span className="sub">{t('line.notStated')}</span>
        )}
      </td>
      <td className="num hide-narrow">
        {!descriptor && l.price && (
          <>
            {l.price.net}
            {l.price.baseQuantity && l.price.baseQuantity !== '1' && (
              <span className="sub">{t('line.per', { qty: l.price.baseQuantity })}</span>
            )}
          </>
        )}
      </td>
      <td className="num">{descriptor ? '' : l.netAmount}</td>
    </tr>
  );
}

/** Descriptors indented under their heading, adjustments shown beside the lines they apply to. */
export function LinesTable({ inv, limit }: { inv: CanonicalInvoice; limit: number }) {
  const shown = inv.lines.slice(0, limit);
  if (!shown.length) return <p className="more-lines">{t('line.none')}</p>;
  const under = new Set((inv.relations ?? []).filter((r) => r.type === 'heading').flatMap((r) => r.to));
  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard */}
      <section className="table-scroll" tabIndex={0} aria-label={t('view.lines')}>
        <table className="lines">
          <thead>
            <tr>
              <th scope="col" className="hide-narrow">
                #
              </th>
              <th scope="col">{t('line.item')}</th>
              <th scope="col" className="num">
                {t('line.qty')}
              </th>
              <th scope="col" className="num hide-narrow">
                {t('line.price')}
              </th>
              <th scope="col" className="num">
                {t('line.net')}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <LineRow inv={inv} line={l} under={under} key={l.id} />
            ))}
          </tbody>
        </table>
      </section>
      {inv.lines.length > limit && <p className="more-lines">{t('line.more', { count: inv.lines.length - limit })}</p>}
    </>
  );
}

/** Approximate download sizes of the WebLLM models, shown before anything is fetched. */
const ENGINE_SIZE: Record<string, string> = { 'qwen3-0.6b': '0.5 GB', 'qwen3-1.7b': '1 GB', 'qwen3-4b': '2.5 GB' };

export interface ModelState {
  inv: CanonicalInvoice;
  phase: 'idle' | 'busy' | 'done' | 'error';
  text: string;
  fraction?: number;
  /** Puts the invoice back as it was before the first model run. */
  undo?: () => void;
}

export function ModelPanel({
  state,
  engine,
  nanoStatus,
  onEngine,
  onRun,
  onDismiss,
}: {
  /** The model state for this invoice, if a run has happened. */
  state?: ModelState;
  engine: string;
  nanoStatus?: string;
  onEngine: (id: string) => void;
  onRun: (spec: EngineSpec) => void;
  onDismiss: () => void;
}) {
  const busy = state?.phase === 'busy';
  const option = (e: EngineSpec) => {
    const unavailable = e.kind === 'gemini-nano' && nanoStatus === 'unavailable';
    const note =
      e.kind === 'gemini-nano'
        ? t(unavailable ? 'model.unavailable' : 'model.optBuiltin')
        : t('model.optSize', { size: ENGINE_SIZE[e.id] ?? '' });
    return (
      <label className="engine" key={e.id}>
        <input
          type="radio"
          name="model-engine"
          value={e.id}
          checked={e.id === engine}
          disabled={busy || unavailable}
          onChange={() => onEngine(e.id)}
        />
        <span>
          <strong>{e.label}</strong>
          <small>{note}</small>
        </span>
      </label>
    );
  };
  return (
    <section className="model" aria-labelledby="model-title">
      <div className="model-head">
        <h3 id="model-title">{t('model.title')}</h3>
        <span className="model-tag">{t('model.badge')}</span>
        <span className="model-tag local">{t('model.local')}</span>
      </div>
      <p>{t('model.explain')}</p>
      <fieldset disabled={busy}>
        <legend>{t('model.engine')}</legend>
        {ENGINES.map(option)}
      </fieldset>
      <div className="model-actions">
        <Button
          disabled={busy}
          onClick={() => {
            const spec = ENGINES.find((e) => e.id === engine);
            if (spec) onRun(spec);
          }}
        >
          {t('model.run')}
        </Button>
        {busy && <progress max={1} value={state?.fraction} aria-label={t('model.progressLabel')} />}
        <span className={state?.phase === 'error' ? 'model-status error' : 'model-status'} role="status">
          {state?.text ?? ''}
        </span>
        {state?.undo && (
          <Button variant="ghost" onClick={onDismiss}>
            {t('model.dismiss')}
          </Button>
        )}
      </div>
      <Html as="p" className="model-learn" k="model.learn" />
    </section>
  );
}
