#!/usr/bin/env node
/**
 * #2141 - local-only validation of the private Telegram ↔ LINE OA CSV.
 * Do not upload the CSV, send its rows to telemetry, or print raw values.
 * Usage: node scripts/validate-telegram-member-link-source.mjs /path/to/private.csv
 */
import { readFileSync } from 'node:fs';

const HEADERS = [
  'line_oa_customer_ref',
  'telegram_display_name',
  'telegram_username',
  'telegram_user_id_numeric',
  'line_id_handle',
  'phone',
  'email',
  'nickname',
  'note_date',
  'telegram_missing',
  'possible_duplicate',
  'telegram_name_history',
];

function parseCsv(text) {
  const records = [];
  let fields = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(value);
      value = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      fields.push(value);
      value = '';
      if (fields.some((field) => field.length > 0)) records.push(fields);
      fields = [];
    } else {
      value += char;
    }
  }
  if (inQuotes) throw new Error('Unclosed quoted CSV value');
  if (value !== '' || fields.length > 0) records.push([...fields, value]);
  return records;
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/validate-telegram-member-link-source.mjs /path/to/private.csv');
  process.exit(2);
}

let parsed;
try {
  parsed = parseCsv(readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
} catch {
  console.error('Unable to read or parse local CSV; no private row data was printed.');
  process.exit(2);
}

const [header, ...data] = parsed;
const headerValid = Array.isArray(header)
  && HEADERS.length === header.length
  && HEADERS.every((name, index) => header[index] === name);
if (!headerValid) {
  console.error('CSV header mismatch: expected exactly 12 columns in the #2141 contract.');
  process.exit(1);
}

const summary = {
  total_rows: data.length,
  has_telegram: 0,
  telegram_missing: 0,
  possible_duplicate: 0,
  unknown_chat_reference: 0,
  placeholder_username: 0,
  valid: true,
  issues_by_category: {},
};

function flag(category) {
  summary.issues_by_category[category] = (summary.issues_by_category[category] || 0) + 1;
  summary.valid = false;
}

for (const values of data) {
  if (values.length !== HEADERS.length) {
    flag('column_count');
    continue;
  }
  const item = Object.fromEntries(HEADERS.map((key, index) => [key, values[index]]));
  const hasTelegram = Boolean(
    item.telegram_display_name || item.telegram_username || item.telegram_user_id_numeric
  );
  const isMissing = item.telegram_missing.toLowerCase() === 'true';
  if (hasTelegram) summary.has_telegram++;
  if (isMissing) summary.telegram_missing++;
  if (item.possible_duplicate.toLowerCase() === 'true') summary.possible_duplicate++;
  if (/^unknown\b/i.test(item.line_oa_customer_ref)) summary.unknown_chat_reference++;
  if (item.telegram_username === 'username') summary.placeholder_username++;

  if (!item.line_oa_customer_ref) flag('missing_customer_ref');
  if (!(item.line_id_handle || item.phone || item.email)) flag('missing_match_identifier');
  if (!['true', 'false'].includes(item.telegram_missing.toLowerCase())) flag('telegram_missing_not_boolean');
  if (!['true', 'false'].includes(item.possible_duplicate.toLowerCase())) flag('possible_duplicate_not_boolean');
  if (isMissing === hasTelegram) flag('telegram_missing_conflict');
  if (item.telegram_username &&
      (item.telegram_username.startsWith('@') ||
       item.telegram_username !== item.telegram_username.toLowerCase())) flag('username_not_normalized');
  if (item.telegram_user_id_numeric && !/^\d{5,20}$/.test(item.telegram_user_id_numeric)) flag('telegram_id_invalid');
  if (item.phone && !/^0\d{9}$/.test(item.phone)) flag('phone_invalid');
  if (item.email && item.email !== item.email.toLowerCase()) flag('email_not_normalized');
}

console.log(JSON.stringify(summary, null, 2));
if (!summary.valid) process.exitCode = 1;
