#!/usr/bin/env node
/**
 * build-model.mjs — pool contribution files into a fresh wormtrace-model.json.
 *
 * Download the "WormTrace Contributions" folder from Google Drive (each file is one
 * contribution: {type:'wormtrace-contribution', rows:[{f:[5], cat}], ...}), then:
 *
 *   node tools/build-model.mjs <contributions-dir> [output.json]
 *
 * Defaults output to ./wormtrace-model.json (overwriting the shipped model). It merges
 * every contribution's feature rows, migrates old size-class labels to life stages,
 * de-duplicates identical rows (the same logic WormLearner uses in-app), and caps the
 * total so the k-NN stays fast on a phone.
 *
 * Note: this pools the numeric feature ROWS. Re-extracting features from the raw photos
 * (for a stronger model) is a separate, heavier step — out of scope here.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FEATS = 5;
const MAX_ROWS = 6000;                                   // matches WormLearner
const CAT_MIGRATE = { large: 'l4', juvenile: 'l2', baby: 'l1', edge: 'l4' };
const VALID_CATS = new Set(['l1', 'l2', 'l3', 'l4', 'adult', 'egg', 'dead', 'none']);

const inDir = process.argv[2];
const outPath = process.argv[3] || 'wormtrace-model.json';
if (!inDir) {
  console.error('Usage: node tools/build-model.mjs <contributions-dir> [output.json]');
  process.exit(1);
}

const rowKey = r => r.f.map(x => Math.round(x * 1e5)).join(',') + '|' + r.cat;

const files = readdirSync(resolve(inDir)).filter(f => f.toLowerCase().endsWith('.json'));
let images = 0, considered = 0, kept = 0, badFiles = 0;
const seen = new Set();
const rows = [];

// One file may be a single contribution/training object, OR a combined batch with an
// items[] array (from the app's "Export all training data"). Normalize to a list of
// entries that each carry their own `rows`.
function entriesFrom(obj) {
  if (obj?.type === 'wormtrace-training-batch' && Array.isArray(obj.items)) return obj.items;
  if ((obj?.type === 'wormtrace-contribution' || obj?.type === 'wormtrace-training') && Array.isArray(obj.rows)) return [obj];
  return null;
}

for (const f of files) {
  let obj;
  try { obj = JSON.parse(readFileSync(join(resolve(inDir), f), 'utf8')); }
  catch { badFiles++; continue; }
  const entries = entriesFrom(obj);
  if (!entries) { badFiles++; continue; }

  for (const entry of entries) {
    if (!Array.isArray(entry.rows)) continue;
    images++;                                            // 1 photo per entry
    for (const r of entry.rows) {
      considered++;
      if (!Array.isArray(r.f) || r.f.length !== FEATS || !r.cat) continue;
      const cat = CAT_MIGRATE[r.cat] || r.cat;
      if (!VALID_CATS.has(cat)) continue;
      const row = { f: r.f.map(Number), cat };
      const k = rowKey(row);
      if (seen.has(k)) continue;                         // drop exact duplicates
      seen.add(k); rows.push(row); kept++;
    }
  }
}

const finalRows = rows.length > MAX_ROWS ? rows.slice(-MAX_ROWS) : rows;
const byCat = {};
for (const r of finalRows) byCat[r.cat] = (byCat[r.cat] || 0) + 1;

const model = { type: 'wormtrace-model', version: 1, features: FEATS, images, rows: finalRows };
writeFileSync(resolve(outPath), JSON.stringify(model));

console.log(`Files:        ${files.length} (${badFiles} skipped as invalid)`);
console.log(`Photos:       ${images}`);
console.log(`Rows:         ${kept} kept of ${considered} (deduped)` +
            (rows.length > MAX_ROWS ? ` → capped to ${MAX_ROWS}` : ''));
console.log(`By category:  ${JSON.stringify(byCat)}`);
console.log(`Wrote:        ${resolve(outPath)}`);
console.log(`\nReview, then commit ${outPath} and bump the asset version to ship the improved model.`);
