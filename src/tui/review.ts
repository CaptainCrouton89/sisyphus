import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RequirementsData } from './review-types.js';
import { startReviewApp } from './review-app.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: sisyphus-review <requirements.json>');
  console.log('');
  console.log('Interactive terminal review for EARS requirements.');
  console.log('');
  console.log('Arguments:');
  console.log('  <requirements.json>  Path to the requirements JSON file');
  process.exit(0);
}

const filePath = args[0];
if (!filePath) {
  console.error('Error: No requirements.json path provided.');
  console.error('Usage: sisyphus-review <requirements.json>');
  process.exit(1);
}

const resolved = resolve(filePath);
if (!existsSync(resolved)) {
  console.error(`Error: File not found: ${resolved}`);
  process.exit(1);
}

let data: RequirementsData;
try {
  const raw = readFileSync(resolved, 'utf-8');
  data = JSON.parse(raw);
} catch (err) {
  console.error(`Error: Failed to parse ${resolved}: ${(err as Error).message}`);
  process.exit(1);
}

if (!data.meta || !data.groups) {
  console.error('Error: Invalid requirements.json — missing meta or groups.');
  process.exit(1);
}

startReviewApp(data, resolved);
