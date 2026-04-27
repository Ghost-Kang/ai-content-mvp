// D31 (2026-04-26) — Dump the full Avro schema from a 新榜 daily file.
//
// The list endpoint returns .avro OCF files (Obj\x01 magic). Every OCF
// header carries its own schema as a JSON string under the `avro.schema`
// metadata key — which means we do NOT need any Avro runtime to learn
// the contract. Parsing the header only needs zigzag-varint + slice.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/dump-newrank-schema.ts \
//     [--date=YYYY-MM-DD] [--platform=dy|ks|xhs|bz]
//
// Defaults: date = today-3 (ks/xhs/bz/dy all typically present at T-3),
// platform = dy (抖音 — the one we most care about for topic selection,
// and the one that publishes latest, so most worth confirming).
//
// Output:
//   1. Download the platform-day file into docs/research/
//   2. Verify md5 + OCF magic
//   3. Parse OCF metadata map → extract avro.schema + avro.codec
//   4. Pretty-print the schema JSON and a flat field-list summary
//
// This is the W4-01 parser blocker: once we see the full list of fields
// (names + types), we can design the topic-selection node against a
// known shape instead of guessing.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  NewrankClient,
  loadNewrankConfig,
  PLATFORM_LABEL,
  type NewrankPlatform,
  DataSourceError,
} from '../src/lib/data-source/newrank';

// ─── CLI ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  date:     string;
  platform: NewrankPlatform;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { date: defaultDate(), platform: 'dy' };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--date=')) {
      args.date = a.slice('--date='.length);
    } else if (a.startsWith('--platform=')) {
      const v = a.slice('--platform='.length) as NewrankPlatform;
      if (!['dy', 'ks', 'xhs', 'bz'].includes(v)) {
        console.error(`Bad platform "${v}", must be dy/ks/xhs/bz`);
        process.exit(2);
      }
      args.platform = v;
    } else if (a === '-h' || a === '--help') {
      console.log('Usage: dump-newrank-schema.ts [--date=YYYY-MM-DD] [--platform=dy|ks|xhs|bz]');
      process.exit(0);
    } else {
      console.warn(`Unknown arg: ${a}`);
    }
  }
  return args;
}

function defaultDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 3); // T-3: all 4 platforms present (empirical, D31 probe)
  return d.toISOString().slice(0, 10);
}

// ─── Avro OCF header reader ───────────────────────────────────────────────────
//
// OCF layout (Avro 1.x spec, section "Object Container Files"):
//   magic      = "Obj\x01"                       (4 bytes)
//   metadata   = map<string, bytes>              (see below)
//   sync       = 16 bytes
//   data blocks follow...
//
// A map is encoded as a sequence of blocks:
//   long count            (zigzag varint)
//   (if count < 0)  long block-size  (absolute bytes; we skip)
//   count entries: (string key, bytes value)
//   ... repeated ...
//   long 0                → end of map
//
// string = long byte-length + raw utf8
// bytes  = long byte-length + raw bytes

class AvroReader {
  private pos = 0;
  constructor(private readonly buf: Buffer) {}

  readBytes(n: number): Buffer {
    const out = this.buf.subarray(this.pos, this.pos + n);
    if (out.length !== n) {
      throw new Error(`avro: tried to read ${n} bytes at ${this.pos}, only ${out.length} available`);
    }
    this.pos += n;
    return out;
  }

  /**
   * Zigzag-decoded varint — Avro's canonical int/long encoding.
   *
   * Metadata map values we care about (schema JSON, codec string) are
   * at most a few KB, so a plain JS Number (safe up to 2^53) is more
   * than enough. We deliberately avoid BigInt so the script can run
   * under the repo's current TS target.
   */
  readLong(): number {
    let shift = 0;
    let acc = 0;
    for (;;) {
      if (this.pos >= this.buf.length) throw new Error('avro: varint ran past buffer');
      const byte = this.buf[this.pos++];
      acc += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 49) throw new Error('avro: varint too long for Number');
    }
    // Zigzag decode:  (acc >>> 1) ^ -(acc & 1)   — done in plain arithmetic.
    const negative = (acc & 1) === 1;
    const mag = Math.floor(acc / 2);
    return negative ? -(mag + 1) : mag;
  }

  readString(): string {
    const n = this.readLong();
    return this.readBytes(n).toString('utf8');
  }

  readBytesWithLen(): Buffer {
    const n = this.readLong();
    return this.readBytes(n);
  }

  readMap(): Map<string, Buffer> {
    const out = new Map<string, Buffer>();
    for (;;) {
      let count = this.readLong();
      if (count === 0) break;
      if (count < 0) {
        // Negative count = absolute count; next long is block-size in bytes.
        // We don't need the size for key-by-key parsing, but we must read it.
        count = -count;
        this.readLong();
      }
      for (let i = 0; i < count; i++) {
        const k = this.readString();
        const v = this.readBytesWithLen();
        out.set(k, v);
      }
    }
    return out;
  }

  headerOnly(): { magic: Buffer; meta: Map<string, Buffer>; sync: Buffer } {
    const magic = this.readBytes(4);
    if (!(magic[0] === 0x4f && magic[1] === 0x62 && magic[2] === 0x6a && magic[3] === 0x01)) {
      throw new Error(`not an Avro OCF: magic = ${magic.toString('hex')}`);
    }
    const meta = this.readMap();
    const sync = this.readBytes(16);
    return { magic, meta, sync };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface FieldSummary {
  name: string;
  type: string;      // e.g. "string | null", "long | null"
  nullable: boolean;
}

function flattenFields(schemaJson: unknown): FieldSummary[] {
  const out: FieldSummary[] = [];
  if (
    schemaJson === null ||
    typeof schemaJson !== 'object' ||
    (schemaJson as { type?: unknown }).type !== 'record' ||
    !Array.isArray((schemaJson as { fields?: unknown }).fields)
  ) {
    return out;
  }
  const fields = (schemaJson as { fields: Array<Record<string, unknown>> }).fields;
  for (const f of fields) {
    const name = String(f.name ?? '?');
    const t = f.type;
    let typeLabel = 'unknown';
    let nullable = false;
    if (typeof t === 'string') {
      typeLabel = t;
    } else if (Array.isArray(t)) {
      const parts = t.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
      nullable = parts.includes('null');
      typeLabel = parts.join(' | ');
    } else if (t && typeof t === 'object') {
      typeLabel = JSON.stringify(t);
    }
    out.push({ name, type: typeLabel, nullable });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`--- 新榜 Avro schema dump (D31 W4-01 prep) ---`);
  console.log(`Date:     ${args.date}`);
  console.log(`Platform: ${args.platform} (${PLATFORM_LABEL[args.platform]})`);
  console.log('');

  const client = new NewrankClient({ config: loadNewrankConfig() });

  const list = await client.listFiles({ platform: args.platform, date: args.date }).catch((e: unknown) => {
    if (e instanceof DataSourceError) {
      console.error(`❌ list failed: ${e.code} [server=${e.serverCode ?? '-'}] — ${e.message}`);
    } else {
      console.error('❌ list failed:', e);
    }
    process.exit(2);
  });
  if (list.files.length === 0) {
    console.error(`❌ no files for ${args.platform} on ${args.date}; try a different date`);
    process.exit(1);
  }
  const f = list.files[0];
  console.log(`found 1 file: ${f.name}  md5=${f.md5}`);

  // Download
  const t0 = Date.now();
  const res = await fetch(f.url);
  if (!res.ok) { console.error(`❌ HTTP ${res.status} downloading`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`downloaded ${(buf.length / 1024).toFixed(1)} KB in ${Date.now() - t0}ms`);

  // md5 verify
  const md5 = createHash('md5').update(buf).digest('hex');
  const md5OK = md5.toLowerCase() === f.md5.toLowerCase();
  console.log(`md5: ${md5OK ? '✅ matches' : `❌ ${md5} vs server ${f.md5}`}`);

  // Save for future offline runs
  const outDir = path.resolve(__dirname, '../docs/research');
  mkdirSync(outDir, { recursive: true });
  const safeName = f.name.replace(/[^\w.-]/g, '_');
  const outPath = path.join(outDir, `newrank_sample_${args.date}_${args.platform}_${safeName}`);
  writeFileSync(outPath, buf);
  console.log(`saved → ${outPath}`);

  // Parse OCF header
  const reader = new AvroReader(buf);
  const { meta } = reader.headerOnly();
  const codec  = meta.get('avro.codec')?.toString('utf8') ?? 'null';
  const schema = meta.get('avro.schema')?.toString('utf8');
  if (!schema) {
    console.error('❌ no avro.schema key in OCF metadata');
    process.exit(1);
  }
  console.log(`\ncodec:   ${codec}`);
  console.log(`schema size: ${schema.length} chars`);

  // Pretty
  let parsed: unknown;
  try {
    parsed = JSON.parse(schema);
  } catch (e) {
    console.error('❌ avro.schema is not valid JSON:', e);
    process.exit(1);
  }
  const pretty = JSON.stringify(parsed, null, 2);
  console.log('\n=== avro.schema (pretty) ===');
  console.log(pretty);

  const outJsonPath = path.join(outDir, `newrank_schema_${args.platform}_${args.date}.json`);
  writeFileSync(outJsonPath, pretty);
  console.log(`\nschema saved → ${outJsonPath}`);

  const fields = flattenFields(parsed);
  if (fields.length > 0) {
    console.log('\n=== flat field list (W4-01 parser target) ===');
    const nameWidth = Math.max(...fields.map((x) => x.name.length));
    for (const f of fields) {
      console.log(
        `  ${f.name.padEnd(nameWidth)}  ${f.nullable ? '?' : ' '}  ${f.type}`,
      );
    }
    console.log(`\ntotal fields: ${fields.length}`);
  } else {
    console.log('\n(schema is not a simple record — inspect the JSON dump above)');
  }
}

main().catch((e) => {
  console.error('dump errored:', e);
  process.exit(1);
});
