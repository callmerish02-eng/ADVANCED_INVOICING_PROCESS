/**
 * Helper: minify a Google service-account JSON file for the env var.
 *
 * Usage:
 *   bun run scripts/minify-sa-json.ts /path/to/service-account-key.json
 *
 * Reads the JSON, validates required fields, prints a single-line JSON
 * string with no newlines or pretty-printing — ready to paste as the
 * value of GOOGLE_SERVICE_ACCOUNT_JSON in your .env.local or Vercel env.
 */
import { readFileSync } from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: bun run scripts/minify-sa-json.ts /path/to/service-account-key.json');
  process.exit(1);
}

let raw: string;
try {
  raw = readFileSync(path, 'utf8');
} catch (err) {
  console.error('Could not read file:', err);
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error('File is not valid JSON:', err);
  process.exit(1);
}

const sa = parsed as Record<string, unknown>;
const required = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email', 'client_id', 'auth_uri', 'token_uri'];
const missing = required.filter((k) => !sa[k]);
if (missing.length > 0) {
  console.error('Missing required fields:', missing.join(', '));
  console.error('Make sure you downloaded a SERVICE ACCOUNT KEY JSON, not an API key or OAuth client ID.');
  process.exit(1);
}

if (sa.type !== 'service_account') {
  console.error(`Expected "type": "service_account" but found "${sa.type}".`);
  process.exit(1);
}

const minified = JSON.stringify(sa);
console.log('\n--- COPY EVERYTHING BELOW THE LINE ---\n');
console.log(minified);
console.log('\n--- END ---\n');
console.log(`Length: ${minified.length} chars`);
console.log(`client_email: ${sa.client_email}`);
console.log(`project_id:  ${sa.project_id}`);
