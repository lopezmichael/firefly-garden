import type { Codec } from '../state/gardenCode.ts';

/**
 * The garden code's deflate, done by the browser's CompressionStream (every current browser;
 * Safari from 16.4), so nothing is added to the bundle. Raw deflate: the code's own check covers
 * typos, and the save's validation covers the rest.
 */
export const browserCodec: Codec = {
  get supported() {
    return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  },
  async pack(text) {
    return (await drain(through(new TextEncoder().encode(text), new CompressionStream('deflate-raw')), Infinity))!;
  },
  async unpack(bytes, cap) {
    // UTF-8 never takes fewer bytes than characters, so a byte cap at `cap` also caps the text.
    const out = await drain(through(bytes, new DecompressionStream('deflate-raw')), cap);
    return out && new TextDecoder('utf-8', { fatal: true }).decode(out);
  },
};

/** Feed bytes through a (de)compression stream and hand back its reader. */
function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): ReadableStreamDefaultReader<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Not awaited: the write settles only as the other end is read. Bad input errors the readable
  // side, which the reader reports; these promises must not also surface as unhandled.
  writer.write(new Uint8Array(bytes)).catch(() => undefined);
  writer.close().catch(() => undefined);
  return stream.readable.getReader();
}

/** Read a stream to its end, or give up (null) as soon as it passes `cap` bytes. */
async function drain(reader: ReadableStreamDefaultReader<Uint8Array>, cap: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
