#!/usr/bin/env node
// Local preparation only: no network, upload, generation or Telegram calls.
import { createHash } from 'node:crypto';
import { readFile, stat, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const READY_FOLDER_ID = '1CPnNgAY2sKRyh5u0nfr9WpexFV6A_HT6';
const PREFIX = 'hype-compcards/v1/intake/';
const MAX_BYTES = 10_000_000;
const FILE_ID = /^[A-Za-z0-9_-]{10,180}$/;
const MODEL_ID = /^rec[A-Za-z0-9]{8,40}$/;
const REVIEW_FLAGS = ['identity_verified', 'canonical_facts_verified', 'finished_material', 'visual_qa_passed', 'public_safe'];
const META_KEYS = new Set(['file_id', 'source_folder_id', 'model_id', 'canonical_name', 'display_name', 'category', 'approved', 'status', 'selectable', 'height_cm', 'weight_kg', 'caption_stats_allowed', 'review']);
const REVIEW_KEYS = new Set(['reviewed_by', 'reviewed_at', 'source_file_id', ...REVIEW_FLAGS]);
const fail = message => { throw new Error(message); };

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
}

function exactText(value, label) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label} must be a nonempty, trimmed name of at most 120 characters`);
  return value;
}

function metadataValid(meta) {
  object(meta, 'metadata');
  for (const key of Object.keys(meta)) if (!META_KEYS.has(key)) fail(`Unsupported metadata field: ${key}`);
  if (!FILE_ID.test(meta.file_id || '')) fail('file_id must be the actual finished file ID in READY');
  if (meta.source_folder_id !== READY_FOLDER_ID) fail('source_folder_id must be the configured READY folder');
  if (!MODEL_ID.test(meta.model_id || '')) fail('model_id must be an exact canonical Model record ID');
  exactText(meta.canonical_name, 'canonical_name');
  exactText(meta.display_name, 'display_name');
  if (meta.category !== 'standard') fail('Only Standard cards are supported by this intake');
  if (meta.approved !== true || meta.status !== 'active') fail('Explicit approved:true and status:active are required');
  if (typeof meta.selectable !== 'boolean' || typeof meta.caption_stats_allowed !== 'boolean') fail('selectable and caption_stats_allowed must be explicit booleans');
  for (const key of ['height_cm', 'weight_kg']) if (typeof meta[key] !== 'number' || !Number.isFinite(meta[key]) || meta[key] <= 0 || meta[key] > 300) fail(`${key} must be a verified positive number no greater than 300`);
  object(meta.review, 'review');
  for (const key of Object.keys(meta.review)) if (!REVIEW_KEYS.has(key)) fail(`Unsupported review field: ${key}`);
  if (!['assistant', 'owner'].includes(meta.review.reviewed_by)) fail('reviewed_by must be assistant or owner');
  const reviewedAt = meta.review.reviewed_at;
  if (typeof reviewedAt !== 'string' || !Number.isFinite(Date.parse(reviewedAt)) || new Date(reviewedAt).toISOString() !== reviewedAt) fail('reviewed_at must be an exact UTC ISO timestamp, including milliseconds');
  if (!FILE_ID.test(meta.review.source_file_id || '')) fail('source_file_id must be the actual original Drive file ID');
  for (const key of REVIEW_FLAGS) if (meta.review[key] !== true) fail(`review.${key} must be explicitly verified true before preparation`);
}

// Header/container checks support local preparation. They do not replace opening
// and visually reviewing the finished image before setting the review flags.
export function inspectImage(bytes) {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(png)) {
    if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') fail('Invalid PNG header');
    let offset = 8, dataFound = false, endFound = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      if (length > bytes.length - offset - 12) fail('Truncated PNG chunk');
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT' && length > 0) dataFound = true;
      offset += length + 12;
      if (type === 'IEND') {
        if (length !== 0 || offset !== bytes.length) fail('Invalid PNG end');
        endFound = true; break;
      }
    }
    if (!dataFound || !endFound) fail('Incomplete PNG container');
    return { content_type: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) fail('Incomplete JPEG container');
    let offset = 2;
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 0xff) fail('Invalid JPEG marker');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) fail('Truncated JPEG marker');
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) fail('Truncated JPEG segment');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) fail('Invalid JPEG frame');
        return { content_type: 'image/jpeg', height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
    fail('JPEG dimensions unavailable');
  }
  fail('Only finished PNG or JPEG files are supported');
}

export function prepareIntake(bytes, metadata) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 1 || bytes.length > MAX_BYTES) fail('Image must be between 1 and 10,000,000 bytes');
  metadataValid(metadata);
  const image = inspectImage(bytes);
  if (image.width !== 1322 || image.height !== 1200) fail('New intake cards must be exactly 1322 × 1200 pixels');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const entry = {
    id: `intake_${metadata.file_id}_${sha256}`,
    source: 'owner_drive_intake',
    source_folder_id: READY_FOLDER_ID,
    file_id: metadata.file_id,
    model_id: metadata.model_id,
    canonical_name: metadata.canonical_name,
    display_name: metadata.display_name,
    category: metadata.category,
    approved: metadata.approved,
    status: metadata.status,
    selectable: metadata.selectable,
    asset_key: `${PREFIX}assets/${sha256}.json`,
    sha256,
    ...image,
    bytes: bytes.length,
    height_cm: metadata.height_cm,
    weight_kg: metadata.weight_kg,
    caption_stats_allowed: metadata.caption_stats_allowed,
    review: { ...metadata.review },
  };
  const asset = {
    schema: 'hype_compcard_intake_asset_v1', success: true,
    result: { encoding: 'base64', content_type: image.content_type, sha256, data: bytes.toString('base64') },
  };
  return { entry, asset };
}

export async function runCli(args, log = console.log) {
  if (args.length === 1 && args[0] === '--help') {
    log('Usage: node scripts/hype-prepare-intake.mjs --image /absolute/card.png --metadata /absolute/verified.json --out-dir /absolute/prepared\nCreates asset.json and entry.json locally. Does not upload, render, generate or send.');
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--image', '--metadata', '--out-dir'].includes(args[i]) || !args[i + 1] || Object.hasOwn(options, args[i])) fail('Use --image, --metadata and --out-dir once each; see --help');
    options[args[i]] = args[i + 1];
  }
  if (Object.keys(options).length !== 3) fail('Missing --image, --metadata or --out-dir; see --help');
  const imagePath = resolve(options['--image']), metadataPath = resolve(options['--metadata']), output = resolve(options['--out-dir']);
  const imageStat = await stat(imagePath), metadataStat = await stat(metadataPath);
  if (!imageStat.isFile() || imageStat.size < 1 || imageStat.size > MAX_BYTES) fail('Image must be a regular file of at most 10,000,000 bytes');
  if (!metadataStat.isFile() || metadataStat.size > 65_536) fail('Metadata must be a JSON file of at most 65,536 bytes');
  const { entry, asset } = prepareIntake(await readFile(imagePath), JSON.parse(await readFile(metadataPath, 'utf8')));
  await mkdir(output, { recursive: true });
  const assetPath = join(output, 'asset.json'), entryPath = join(output, 'entry.json');
  for (const path of [assetPath, entryPath]) {
    try { await access(path); fail('Output already exists; use a new output directory'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(assetPath, `${JSON.stringify(asset)}\n`, { flag: 'wx', mode: 0o600 });
  await writeFile(entryPath, `${JSON.stringify(entry, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  log(JSON.stringify({ prepared: true, uploaded: false, sent: false, asset_path: assetPath, entry_path: entryPath, asset_key: entry.asset_key, card_id: entry.id, sha256: entry.sha256, bytes: entry.bytes, width: entry.width, height: entry.height }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
