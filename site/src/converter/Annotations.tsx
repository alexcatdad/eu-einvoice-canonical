import { useMemo } from 'react';
import type { CanonicalInvoice } from '../../../src/canonical';
import { AnnotationInputError, buildLineAnnotationInput, validateLineAnnotations } from '../../../src/relations/annotations';
import { t } from '../../i18n';
import { Button } from '../components/ui/button';
import { toast } from '../components/ui/sonner';
import { JsonText } from './Json';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Imported annotations are a separate, unreviewed result; the invoice is never mutated. */
export default function Annotations({
  invoice,
  download,
  text,
  checked,
  onDraft,
}: {
  invoice: CanonicalInvoice;
  download: (text: string, suffix: string) => void;
  text: string;
  checked: boolean;
  onDraft: (text: string, checked: boolean) => void;
}) {
  const selected = useMemo(() => {
    try {
      return { input: buildLineAnnotationInput(invoice) };
    } catch (error) {
      if (!(error instanceof AnnotationInputError)) throw error;
      return { issues: error.issues };
    }
  }, [invoice]);
  const result = useMemo(
    () => (checked && selected.input ? validateLineAnnotations(text, selected.input) : undefined),
    [checked, selected.input, text],
  );
  const inputText = useMemo(() => (selected.input ? JSON.stringify(selected.input, null, 2) : ''), [selected.input]);
  return (
    <section className="annotation-panel" aria-label={t('annotation.title')}>
      <h3>{t('annotation.title')}</h3>
      <p>{t('annotation.explain')}</p>
      <a href={`${BASE}docs/line-annotations/`}>{t('annotation.guide')}</a>
      {selected.issues ? (
        <div className="notice">
          <h4>{t('annotation.unsupported')}</h4>
          <ul>
            {selected.issues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>
                <code>{issue.path}</code>: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <h4>{t('annotation.input')}</h4>
          <p>{t('annotation.origins')}</p>
          <div className="actions">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inputText);
                  toast(t('toast.copied'));
                } catch {
                  toast(t('toast.copyBlocked'));
                }
              }}
            >
              {t('annotation.copy')}
            </Button>
            <Button onClick={() => download(inputText, 'annotation-input')}>{t('annotation.downloadInput')}</Button>
          </div>
          <details>
            <summary>{t('annotation.preview')}</summary>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard access to a scrollable JSON preview */}
            <pre className="json" tabIndex={0}>
              <JsonText text={inputText} />
            </pre>
          </details>
          <label htmlFor="annotation-output">{t('annotation.paste')}</label>
          <textarea
            id="annotation-output"
            spellCheck={false}
            value={text}
            aria-describedby="annotation-import-hint"
            onChange={(event) => onDraft(event.target.value, false)}
          />
          <p id="annotation-import-hint">{t('annotation.importHint')}</p>
          <Button disabled={!text.trim()} onClick={() => onDraft(text, true)}>
            {t('annotation.validate')}
          </Button>
          <div role="status">{result ? t(result.ok ? 'annotation.valid' : 'annotation.invalid') : ''}</div>
          {result && !result.ok && (
            <ul>
              {result.issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <code>{issue.path}</code>: {issue.message}
                </li>
              ))}
            </ul>
          )}
          {result?.ok && (
            <>
              <p>{t('annotation.unreviewed')}</p>
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard access to the scrollable result table */}
              <section className="table-scroll" tabIndex={0} aria-label={t('annotation.result')}>
                <table className="lines">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">{t('line.item')}</th>
                      <th scope="col">{t('annotation.kind')}</th>
                      <th scope="col">{t('annotation.targets')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.value.lines.slice(0, 200).map((line, i) => (
                      <tr key={line.id}>
                        <td>{line.id}</td>
                        <td>{invoice.lines[i].item.name || invoice.lines[i].item.description || t('line.noName')}</td>
                        <td>
                          <code>{line.kind}</code>
                        </td>
                        <td>
                          {line.targets === null
                            ? t('annotation.unresolved')
                            : line.targets.length
                              ? line.targets.join(', ')
                              : t('annotation.none')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {result.value.lines.length > 200 && <p>{t('line.more', { count: result.value.lines.length - 200 })}</p>}
              <Button
                onClick={() =>
                  download(JSON.stringify({ status: 'unreviewed', method: 'imported', annotations: result.value }, null, 2), 'annotations')
                }
              >
                {t('annotation.downloadOutput')}
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
