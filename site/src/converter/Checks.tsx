/** The Checks sheet: validation layers, where the document came from, and the converter's margin notes. */
import type { CanonicalInvoice, ConvertOutcome, ConvertResult, SignatureInfo } from '../../../src/index.ts';
import { t } from '../../i18n';

const LAYERS = ['parse', 'schema', 'semantic', 'profile', 'signature', 'clearance'] as const;

const ENVELOPE_LABEL: Record<string, string> = {
  'pdf-attachment': 'env.pdf-attachment',
  'cms-p7m': 'env.cms-p7m',
  base64: 'env.base64',
  zip: 'env.zip',
  sbdh: 'env.sbdh',
  soap: 'env.soap',
  xml: '',
};

function euNote(s: SignatureInfo): string {
  const e = s.euTrust;
  if (!e) return '';
  const stale = e.snapshot.stale ? t('sig.euStale', { date: e.snapshot.nextUpdate?.slice(0, 10) ?? '' }) : '';
  if (e.qualified) return t('sig.euQualified', { name: e.service?.name ?? '', territory: e.service?.territory ?? '', stale });
  return (e.reason ? t('sig.euReason', { reason: e.reason }) : t('sig.euNotQualified')) + stale;
}

function Provenance({ outcome: o }: { outcome: ConvertOutcome }) {
  const rows: [string, string][] = [];
  if (o.detection.kind === 'invoice') {
    const d = o.detection.details;
    const v = [d.version && t('prov.version', { version: d.version }), d.profile && t('prov.profile', { profile: d.profile })]
      .filter(Boolean)
      .join(', ');
    rows.push([t('prov.format'), `${o.detection.format.name}${v ? `, ${v}` : ''}`]);
  }
  const env = o.payload.envelope.map((s) => (ENVELOPE_LABEL[s.kind] ? t(ENVELOPE_LABEL[s.kind]!) : '')).filter(Boolean);
  if (env.length) rows.push([t('prov.unwrapped'), env.join(', ')]);
  rows.push([t('prov.encoding'), o.payload.encoding]);
  if (o.payload.signatures.length)
    rows.push([
      t('prov.signatures'),
      o.payload.signatures
        .map(
          (s) =>
            `${s.type}${s.signer ? ` (${s.signer})` : ''}${s.verified === undefined ? t('sig.notVerified') : s.verified ? t('sig.verified') : t('sig.invalid')}${euNote(s)}`,
        )
        .join('; '),
    ]);
  return (
    <dl className="provenance">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Notes({ title, rows, quiet }: { title: string; rows: { code?: string; message: string }[]; quiet?: boolean }) {
  return (
    <section className={quiet ? 'quiet' : undefined}>
      <h3>{title}</h3>
      <ul>
        {rows.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the list is rebuilt whole and never reordered
          <li key={i}>
            {r.code && <span className="code">{r.code}</span>} {r.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChecksPanel({ outcome, invoice, result }: { outcome: ConvertOutcome; invoice?: CanonicalInvoice; result: ConvertResult }) {
  const v = invoice?.source.validation ?? outcome.validation;
  const notes = [
    invoice?.source.warnings.length ? (
      <Notes key="check" title={t('pen.check')} rows={invoice.source.warnings.map((w) => ({ code: w.code, message: w.message }))} />
    ) : null,
    invoice?.source.derived.length ? (
      <Notes key="derived" title={t('pen.derived')} rows={invoice.source.derived.map((d) => ({ code: d.field, message: d.rule }))} quiet />
    ) : null,
    result.skipped.length ? (
      <Notes key="skipped" title={t('pen.skipped')} rows={result.skipped.map((s) => ({ code: s.name, message: s.reason }))} quiet />
    ) : null,
  ].filter(Boolean);
  return (
    <div className="checks">
      {v && (
        <section className="layers">
          <h3>{t('val.title')}</h3>
          <p>{t('val.local')}</p>
          {v.result && (
            <p>
              <strong>
                {t('val.coverage')}: {t(`val.result.${v.result}`)}
              </strong>
            </p>
          )}
          <ul>
            {LAYERS.map((l) => (
              <li className={v[l]} key={l}>
                <span>{t(`val.${l}`)}</span>
                <strong>{t(`val.${v[l]}`)}</strong>
                {(l === 'schema' || l === 'semantic' || l === 'profile') && v.bundles[l] && <small>{v.bundles[l]}</small>}
                {(l === 'schema' || l === 'semantic' || l === 'profile') && v.reasons?.[l] && (
                  <small>{t(`val.reason.${v.reasons[l]}`)}</small>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {v?.findings.length ? (
        <Notes
          title={t('val.findings')}
          rows={v.findings.map((f) => ({ code: [f.layer, f.ruleId].filter(Boolean).join(': '), message: f.message }))}
        />
      ) : null}
      <Provenance outcome={outcome} />
      {notes.length > 0 && <div className="pen">{notes}</div>}
    </div>
  );
}
