// Reviewed offline overlay builder. Import is pure: no file reads, writes, network,
// credentials, or CLI work. Calling applyCombinedOverlay without manifestBytes
// reads only the adjacent reviewed manifest. This module never writes output.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SOURCE_SHA = '977a826273850c6f37818263d629e6303354ee08';
export const BASELINE_SHA256 = 'd517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee';
export const CANDIDATE_SHA256 = '0c1d2e76b5d4af4f700dca3bc63d8dc7e0c254b1fd2ab0bb386262a62f3b4898';
export const MANIFEST_SHA256 = '2794b74e276da6268d0690634377e05d91e1bd9a48cd94db499548567d4d365c';
export const BASELINE_BYTES = 207037;
export const CANDIDATE_BYTES = 207623;
export const PINS = Object.freeze({
  source_sha: SOURCE_SHA,
  worker: 'events-worker',
  module: 'model-eta-wrapper.js',
  expected_version: '88e741df-15bd-40ba-a4ce-f88a2735822b',
  expected_deployment: 'd9617e88-3f2f-4698-a3e5-3853fd197e06',
  baseline_sha256: BASELINE_SHA256,
  candidate_sha256: CANDIDATE_SHA256,
  manifest_sha256: MANIFEST_SHA256,
  baseline_bytes: BASELINE_BYTES,
  candidate_bytes: CANDIDATE_BYTES,
});

export const digest = value => createHash('sha256').update(value).digest('hex');

function asBytes(value, label) {
  assert.ok(typeof value === 'string' || value instanceof Uint8Array,
    `${label} must be a UTF-8 string or Uint8Array`);
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
}

function freezeDeep(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freezeDeep(child);
  }
  return Object.freeze(value);
}

// Exact schema, scope, order and replacements, independently pinned by the raw
// manifest digest above. No optional or additional manifest keys are accepted.
const REVIEWED_MANIFEST = freezeDeep({
  "worker": "events-worker",
  "module": "model-eta-wrapper.js",
  "expected_version": "88e741df-15bd-40ba-a4ce-f88a2735822b",
  "expected_deployment": "d9617e88-3f2f-4698-a3e5-3853fd197e06",
  "baseline_sha256": "d517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee",
  "candidate_sha256": "0c1d2e76b5d4af4f700dca3bc63d8dc7e0c254b1fd2ab0bb386262a62f3b4898",
  "scope": {
    "models": [
      {
        "model_id": "recnl4Fksh6pXEwA1",
        "canonical_name": "Porto MJ",
        "slots": [
          "model",
          "standard"
        ],
        "persistence": "until_explicitly_reenabled",
        "selection_sources": [
          "static_manifest",
          "approved_intake"
        ]
      },
      {
        "model_id": "recbdC0waCS3qp452",
        "canonical_name": "EMs16",
        "private_categories": [
          "exclusive",
          "premium",
          "standard"
        ],
        "public_categories_unchanged": [
          "travel",
          "extreme"
        ],
        "slots": [
          "model",
          "standard"
        ],
        "selection_sources": [
          "static_manifest",
          "approved_intake"
        ],
        "persistence": "until_explicitly_reenabled"
      }
    ]
  },
  "unrelated_bytes_preserved": true,
  "sections": [
    {
      "name": "compcard-daily"
    }
  ],
  "replacements": [
    {
      "section": "compcard-daily",
      "before": "const check = evaluateCard(card, byId.get(card.model_id));",
      "after": "const check = card.model_id === \"recnl4Fksh6pXEwA1\" ? { ok: false, reason: \"owner_automatic_selection_excluded\" } : card.model_id === \"recbdC0waCS3qp452\" && [\"exclusive\", \"premium\", \"standard\"].includes(card.category) ? { ok: false, reason: \"owner_private_automation_excluded\" } : evaluateCard(card, byId.get(card.model_id));"
    },
    {
      "section": "compcard-daily",
      "before": "if (plan.chat_ids[destination] !== manifest.destinations[destination]) throw problem(\"compcard_destination_approval_changed\", false);",
      "after": "if (plan.chat_ids[destination] !== manifest.destinations[destination]) throw problem(\"compcard_destination_approval_changed\", false);\n          if (modelSlot && card.model_id === \"recnl4Fksh6pXEwA1\") throw problem(\"compcard_owner_excluded_porto\", false);\n          if (modelSlot && card.model_id === \"recbdC0waCS3qp452\" && [\"exclusive\", \"premium\", \"standard\"].includes(card.category)) throw problem(\"compcard_owner_private_automation_excluded\", false);"
    }
  ]
});

export function validateManifestBytes(manifestBytes) {
  const raw = asBytes(manifestBytes, 'manifestBytes');
  assert.equal(digest(raw), MANIFEST_SHA256, 'reviewed combined manifest changed');
  const manifest = JSON.parse(raw.toString('utf8'));
  assert.deepEqual(manifest, REVIEWED_MANIFEST, 'combined manifest schema, scope or replacements changed');
  return freezeDeep(manifest);
}

function uniqueIndex(text, anchor, label) {
  assert.ok(typeof anchor === 'string' && anchor.length > 0, `${label}: empty anchor`);
  const at = text.indexOf(anchor);
  assert.ok(at >= 0 && text.indexOf(anchor, at + 1) === -1, `${label}: ambiguous source anchor`);
  return at;
}

function dailyBounds(text) {
  const markers = [...text.matchAll(/^\/\/ src\/([^\r\n]+)$/gm)];
  const daily = markers.filter(match => match[1] === 'compcard-daily.js');
  assert.equal(daily.length, 1, 'expected one compcard-daily section');
  const marker = daily[0];
  const next = markers.find(match => match.index > marker.index);
  return { start: marker.index + marker[0].length, end: next?.index ?? text.length };
}

function locateChange(text, anchor, section, label) {
  assert.equal(section, 'compcard-daily', `${label}: forbidden section`);
  const at = uniqueIndex(text, anchor, label);
  const bounds = dailyBounds(text);
  assert.ok(at >= bounds.start && at + anchor.length <= bounds.end,
    `${label}: source anchor outside compcard-daily`);
  return at;
}

export function applyCombinedOverlay(code, manifestBytes) {
  const manifest = validateManifestBytes(manifestBytes === undefined
    ? readFileSync(new URL('./overlay-manifest.json', import.meta.url))
    : manifestBytes);
  const raw = asBytes(code, 'code');
  assert.equal(digest(raw), BASELINE_SHA256,
    'live baseline drift: require the exact pinned baseline, never a prior single overlay');
  assert.equal(raw.length, BASELINE_BYTES, 'live baseline byte length changed');
  const baseline = raw.toString('utf8');
  assert.ok(Buffer.from(baseline, 'utf8').equals(raw), 'baseline is not lossless UTF-8');
  const changes = manifest.replacements.map((change, index) => ({
    ...change,
    at: locateChange(baseline, change.before, change.section, `replacement ${index + 1}`),
  })).sort((left, right) => right.at - left.at);
  assert.equal(changes.length, 2, 'exactly two reviewed replacements are required');
  assert.ok(changes[1].at + changes[1].before.length <= changes[0].at, 'overlapping source anchors');
  let candidate = baseline;
  for (const change of changes) {
    candidate = candidate.slice(0, change.at) + change.after + candidate.slice(change.at + change.before.length);
  }
  assert.equal(Buffer.byteLength(candidate, 'utf8'), CANDIDATE_BYTES, 'candidate byte length changed');
  assert.equal(digest(candidate), CANDIDATE_SHA256, 'candidate hash changed');
  let restored = candidate;
  for (const [index, change] of [...manifest.replacements].reverse().entries()) {
    const at = locateChange(restored, change.after, change.section, `reverse replacement ${index + 1}`);
    restored = restored.slice(0, at) + change.before + restored.slice(at + change.after.length);
  }
  assert.ok(Buffer.from(restored, 'utf8').equals(raw), 'unrelated runtime bytes changed');
  return candidate;
}
