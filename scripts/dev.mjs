#!/usr/bin/env node
/**
 * Zero-dependency dev runner.
 *
 * Starts the API (server/) and the Vite dev server (client/) side by side, tags
 * every line of their output so it is obvious who said what, and shuts both down
 * on Ctrl+C. No npm-run-all / concurrently dependency needed.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { name: 'api', cwd: resolve(root, 'server'), args: ['run', 'dev'], colour: '\u001b[36m' },
  { name: 'web', cwd: resolve(root, 'client'), args: ['run', 'dev'], colour: '\u001b[35m' },
];

const RESET = '\u001b[0m';
const DIM = '\u001b[2m';
const children = [];
let shuttingDown = false;

function prefixLines(stream, name, colour) {
  let buffer = '';

  stream.on('data', (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      process.stdout.write(`${colour}[${name}]\u001b[0m ${DIM}│\u001b[0m ${line}\n`);
    }
  });
}

function start({ name, cwd, args, colour }) {
  if (!existsSync(resolve(cwd, 'package.json'))) {
    console.error(`${colour}[${name}]\u001b[0m missing package.json in ${cwd} - run "npm install" first.`);
    return;
  }

  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  prefixLines(child.stdout, name, colour);
  prefixLines(child.stderr, name, colour);

  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.log(`${colour}[${name}]\u001b[0m exited with code ${code}. Stopping everything.`);
    shutdown(code ?? 0);
  });

  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }

  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('\u001b[1mFoodFlow dev\u001b[0m');
console.log('  api  -> http://localhost:5000/api/health');
console.log('  web  -> http://localhost:5173');
console.log('  Ctrl+C stops both.\n');

for (const target of TARGETS) start(target);