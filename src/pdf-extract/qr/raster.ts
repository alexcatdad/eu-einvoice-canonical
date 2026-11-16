/** Grey-level images for the QR decoder: from pdf.js image data, and from a module matrix built from vector paths. */

/** One byte per pixel, 0 black to 255 white. */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

/** pdf.js image data as returned by `page.objs.get` (ImageKind 1: 1 bit grey, 2: RGB, 3: RGBA). */
export interface PdfjsImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}

/** Grey levels of a pdf.js image; a 1-bit image mask (no kind) reads set bits as white. Undefined for other shapes. */
export function toGray(img: PdfjsImage): Gray | undefined {
  const { width: w, height: h, data } = img;
  if (!data || !(w > 0) || !(h > 0)) return undefined;
  const out = new Uint8Array(w * h);
  const kind = img.kind ?? 1;
  if (kind === 1) {
    const row = Math.ceil(w / 8);
    if (data.length < row * h) return undefined;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = data[y * row + (x >> 3)] & (0x80 >> (x & 7)) ? 255 : 0;
  } else if (kind === 2 || kind === 3) {
    const step = kind === 2 ? 3 : 4;
    if (data.length < w * h * step) return undefined;
    for (let i = 0; i < w * h; i++) {
      const o = i * step;
      const luma = (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
      const alpha = step === 4 ? data[o + 3] / 255 : 1;
      out[i] = Math.round(luma * alpha + 255 * (1 - alpha)); // transparent pixels show the white page
    }
  } else return undefined;
  return { width: w, height: h, data: out };
}

/** The image enlarged `scale` times (nearest neighbour), optionally inverted, with a white border of `pad` pixels, as RGBA. */
export function toRgba(img: Gray, scale: number, pad: number, invert = false): { width: number; height: number; data: Uint8Array } {
  const width = img.width * scale + 2 * pad;
  const height = img.height * scale + 2 * pad;
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < img.height * scale; y++)
    for (let x = 0; x < img.width * scale; x++) {
      const v = img.data[Math.floor(y / scale) * img.width + Math.floor(x / scale)];
      const o = ((y + pad) * width + x + pad) * 4;
      data[o] = data[o + 1] = data[o + 2] = invert ? 255 - v : v;
    }
  return { width, height, data };
}

/** A module matrix (true = dark) as a grey image of one pixel per module. */
export function matrixToGray(bits: boolean[][]): Gray {
  const n = bits.length;
  const data = new Uint8Array(n * n);
  bits.forEach((row, y) => {
    row.forEach((dark, x) => {
      data[y * n + x] = dark ? 0 : 255;
    });
  });
  return { width: n, height: n, data };
}
