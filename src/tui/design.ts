import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DesignData } from './design-types.js';
import { startDesignApp } from './design-app.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: sisyphus-design <design.json>');
  console.log('');
  console.log('Interactive terminal walkthrough for technical designs.');
  console.log('');
  console.log('Arguments:');
  console.log('  <design.json>  Path to the design JSON file');
  process.exit(0);
}

const filePath = args[0];
if (!filePath) {
  console.error('Error: No design.json path provided.');
  console.error('Usage: sisyphus-design <design.json>');
  process.exit(1);
}

const resolved = resolve(filePath);
if (!existsSync(resolved)) {
  console.error(`Error: File not found: ${resolved}`);
  process.exit(1);
}

let data: DesignData;
try {
  const raw = readFileSync(resolved, 'utf-8');
  data = JSON.parse(raw);
} catch (err) {
  console.error(`Error: Failed to parse ${resolved}: ${(err as Error).message}`);
  process.exit(1);
}

if (!data.meta || !data.sections) {
  console.error('Error: Invalid design.json — missing meta or sections.');
  process.exit(1);
}

startDesignApp(data, resolved);
