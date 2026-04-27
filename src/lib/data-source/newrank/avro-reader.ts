// D31 (2026-04-26) — 新榜 Avro OCF reader.
//
// The list endpoint returns file URLs; each file is Apache Avro OCF
// (magic "Obj\x01", codec=null). This module decodes the OCF buffer
// into a stream of raw record objects. Schema differs per platform
// (see docs/research/newrank_schema_*.json); this reader stays
// schema-agnostic — field normalization lives in ./normalize.ts.
//
// We use `avsc` (mtth/avsc, ~70 KB) rather than hand-rolling OCF
// parsing: it gives us proper long handling, codec support (if the
// vendor ever enables deflate/snappy), and solid schema validation.
// The dependency is server-only — nothing in this file is imported
// by client bundles.
//
// Design choice: we expose a plain `async` function that buffers
// all records in memory. A daily file is ~500 rows × ~22 fields ×
// (maybe) 200 bytes = well under 1 MB parsed — no need to stream.
// If a larger file ever shows up, switch to `decodeNewrankAvroStream`.

import { Readable } from 'node:stream';
// Disable the barrel-style eslint for the default import below — `avsc`
// ships CJS with a default export, and named imports don't resolve on
// Node 20. `import avro from 'avsc'` works under tsx, next build, and
// the prod `node` runtime alike.
import avro from 'avsc';

/**
 * A raw record as emitted by `avsc`'s OCF decoder. Field shapes
 * follow the Avro schema embedded in the file, which means union
 * types like `["string", "null"]` surface as either a string or
 * `null` — `avsc` unwraps the union discriminator for us.
 */
export type NewrankAvroRecord = Record<string, unknown>;

export interface DecodeResult {
  records: NewrankAvroRecord[];
  /** Raw schema JSON string from the OCF header metadata. */
  schemaJson: string;
  /** OCF codec key — "null" (no compression) in practice today. */
  codec: string;
}

/**
 * Decode a 新榜 Avro OCF buffer into plain JS records.
 *
 * Throws `Error` on malformed OCF / schema mismatch. Callers should
 * treat this the same as any other parser failure (don't retry;
 * the file is served with a fixed md5 so a bad decode won't heal
 * itself).
 */
export async function decodeNewrankAvroBuffer(buf: Buffer): Promise<DecodeResult> {
  // BlockDecoder consumes a Node stream — wrap the buffer.
  const source = Readable.from(buf);
  // `avro.streams` is the canonical entry in avsc 5.x for OCF IO.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoder = new (avro as any).streams.BlockDecoder();

  let codec = 'null';
  let schemaJson = '';
  const records: NewrankAvroRecord[] = [];

  return new Promise<DecodeResult>((resolve, reject) => {
    decoder.on('metadata', (_type: unknown, cdc: string, header: { meta: Record<string, Buffer> }) => {
      // `cdc` is the codec string ("null" | "deflate" | "snappy" | ...)
      codec = cdc;
      const rawSchema = header?.meta?.['avro.schema'];
      if (rawSchema) schemaJson = Buffer.from(rawSchema).toString('utf8');
    });
    decoder.on('data', (r: NewrankAvroRecord) => records.push(r));
    decoder.on('error', reject);
    decoder.on('end', () => resolve({ records, schemaJson, codec }));
    source.pipe(decoder);
  });
}
