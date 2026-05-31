#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const HtaccessFile = path.join(FRONTEND_DIR, 'public', '.htaccess');
const GoneFile = path.join(FRONTEND_DIR, 'public', 'entities-data', 'gone-routes.json');

const BEGIN_MARKER = '  # BEGIN GENERATED GONE ENTITY RULES';
const END_MARKER = '  # END GENERATED GONE ENTITY RULES';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeRulePath(href) {
  return String(href).replace(/^\//, '').replace(/[.^$+?()|[\]{}]/g, '\\$&');
}

function buildRules() {
  const payload = readJson(GoneFile);
  if (!payload) return [BEGIN_MARKER, '  # No gone entity routes generated yet.', END_MARKER];

  const rules = [
    BEGIN_MARKER,
    '  # Serve 410 Gone for removed entity URLs before the SPA fallback.',
  ];

  (payload.film || []).forEach((href) => {
    rules.push(`  RewriteRule ^${escapeRulePath(href)}/?$ - [G,L]`);
  });

  (payload.series || []).forEach((href) => {
    rules.push(`  RewriteRule ^${escapeRulePath(href)}/?$ - [G,L]`);
  });

  rules.push(END_MARKER);
  return rules;
}

function main() {
  const source = fs.readFileSync(HtaccessFile, 'utf8');
  const start = source.indexOf(BEGIN_MARKER);
  const end = source.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    throw new Error('.htaccess markers for generated gone rules not found');
  }

  const before = source.slice(0, start);
  const after = source.slice(end + END_MARKER.length);
  const updated = `${before}${buildRules().join('\n')}${after}`;
  fs.writeFileSync(HtaccessFile, updated, 'utf8');
  console.log('✅ .htaccess gone rules synced');
}

main();
