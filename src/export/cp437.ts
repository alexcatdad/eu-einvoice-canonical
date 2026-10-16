/** Code page 437 (IBM PC 8), the encoding SIE 4 files declare with `#FORMAT PC8`. */

const HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

const REVERSE = new Map<string, number>([...HIGH].map((ch, i) => [ch, 0x80 + i]));

export interface Cp437Result {
  bytes: Uint8Array;
  /** Characters that had no CP437 form, replaced by '?' or by their unaccented letter. */
  replaced: string[];
}

/** Encodes text to CP437. Control characters become spaces; unknown characters lose their accent or become '?'. */
export function encodeCp437(text: string): Cp437Result {
  const out: number[] = [];
  const replaced = new Set<string>();
  const put = (ch: string): boolean => {
    const code = ch.codePointAt(0) as number;
    if (code === 0x0a || code === 0x0d) out.push(code);
    else if (code < 0x20 || code === 0x7f) out.push(0x20);
    else if (code < 0x7f) out.push(code);
    else {
      const b = REVERSE.get(ch);
      if (b === undefined) return false;
      out.push(b);
    }
    return true;
  };
  for (const ch of text) {
    if (put(ch)) continue;
    replaced.add(ch);
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    if (!(base !== ch && base.length > 0 && [...base].every(put))) out.push(0x3f);
  }
  return { bytes: Uint8Array.from(out), replaced: [...replaced] };
}
