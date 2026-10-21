import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareIntake, READY_FOLDER_ID, runCli } from './hype-prepare-intake.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
function png(width = 1322, height = 1200) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const image = png();
function metadata() {
  return {
    file_id: 'driveFinishedFixture01', source_folder_id: READY_FOLDER_ID,
    model_id: 'recFixtureModel001', canonical_name: 'Fixture Model', display_name: 'Fixture Model',
    category: 'standard', approved: true, status: 'active', selectable: true,
    height_cm: 178, weight_kg: 65, caption_stats_allowed: true,
    review: { reviewed_by: 'assistant', reviewed_at: '2026-10-22T06:00:00.000Z', source_file_id: 'driveSourceFixture001',
      identity_verified: true, canonical_facts_verified: true, finished_material: true, visual_qa_passed: true, public_safe: true },
  };
}

test('prepares exact immutable image bytes and repeatable identity without network', () => {
  const prepared = prepareIntake(image, metadata());
  assert.equal(prepared.asset.schema, 'hype_compcard_intake_asset_v1');
  assert.equal(prepared.asset.result.encoding, 'base64');
  assert.deepEqual(Buffer.from(prepared.asset.result.data, 'base64'), image);
  assert.equal(prepared.entry.sha256, createHash('sha256').update(image).digest('hex'));
  assert.equal(prepared.entry.bytes, image.length);
  assert.equal(prepared.entry.width, 1322); assert.equal(prepared.entry.height, 1200);
  assert.equal(prepared.entry.asset_key, `hype-compcards/v1/intake/assets/${prepared.entry.sha256}.json`);
  assert.equal(prepared.entry.id, `intake_${metadata().file_id}_${prepared.entry.sha256}`);
  assert.deepEqual(prepareIntake(image, metadata()), prepared);
});

test('refuses an unreviewed or non-Standard source and never invents facts', () => {
  for (const field of ['identity_verified', 'canonical_facts_verified', 'finished_material', 'visual_qa_passed', 'public_safe']) {
    const meta = metadata(); delete meta.review[field];
    assert.throws(() => prepareIntake(image, meta), new RegExp(field));
  }
  const wrongCategory = metadata(); wrongCategory.category = 'premium';
  assert.throws(() => prepareIntake(image, wrongCategory), /Only Standard/);
  const missingHeight = metadata(); delete missingHeight.height_cm;
  assert.throws(() => prepareIntake(image, missingHeight), /height_cm/);
  const wrongFolder = metadata(); wrongFolder.source_folder_id = 'unverifiedDriveFolder';
  assert.throws(() => prepareIntake(image, wrongFolder), /READY folder/);
});

test('rejects wrong dimensions, truncated images, oversized inputs and private extra fields', () => {
  assert.throws(() => prepareIntake(png(1, 1), metadata()), /1322/);
  assert.throws(() => prepareIntake(image.subarray(0, 33), metadata()), /Incomplete PNG/);
  assert.throws(() => prepareIntake(Buffer.alloc(10_000_001), metadata()), /10,000,000/);
  const meta = metadata(); meta.customer_amount = 10000;
  assert.throws(() => prepareIntake(image, meta), /Unsupported metadata/);
});

test('CLI writes local outputs, omits payload from stdout and refuses overwrite', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'hype-intake-helper-'));
  try {
    const input = join(temporary, 'card.png'), meta = join(temporary, 'metadata.json'), output = join(temporary, 'prepared');
    await writeFile(input, image); await writeFile(meta, JSON.stringify(metadata()));
    const args = ['--image', input, '--metadata', meta, '--out-dir', output];
    const messages = [];
    await runCli(args, message => messages.push(message));
    assert.equal(messages.length, 1);
    const status = JSON.parse(messages[0]);
    assert.equal(status.prepared, true); assert.equal(status.uploaded, false); assert.equal(status.sent, false);
    assert.equal(Object.hasOwn(status, 'data'), false);
    const asset = JSON.parse(await readFile(join(output, 'asset.json'), 'utf8'));
    assert.deepEqual(Buffer.from(asset.result.data, 'base64'), image);
    await assert.rejects(() => runCli(args, () => {}), /Output already exists/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
