/** The JSON sheet's text, coloured by token. Built as React elements: the file's content never becomes markup. */
import { type ReactNode, useMemo } from 'react';

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

export function JsonText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    let last = 0;
    let n = 0;
    for (const m of text.matchAll(TOKEN)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const [whole, str, colon, lit] = m;
      if (str) {
        if (colon)
          out.push(
            <span className="k" key={n++}>
              {str}
            </span>,
            colon,
          );
        else
          out.push(
            <span className="s" key={n++}>
              {str}
            </span>,
          );
      } else
        out.push(
          <span className={lit ? 'l' : 'n'} key={n++}>
            {whole}
          </span>,
        );
      last = m.index + whole.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text]);
  return <>{parts}</>;
}
