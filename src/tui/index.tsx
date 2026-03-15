import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

const cwd = getArg('cwd') ?? process.cwd();

render(<App cwd={cwd} />);
