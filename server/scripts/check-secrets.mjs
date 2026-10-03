/**
 * Fails if a real secret has been committed to a tracked file.
 *
 * The `.env` files are gitignored, but `.env.example` and friends are tracked,
 * so this guards against pasting a live Supabase service_role key (or a
 * Razorpay secret) into one of them.
 *
 * Usage: npm run check:secrets
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PATTERNS = [
  {
    name: 'Supabase service_role JWT',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    // The payload of every service_role key contains this marker.
    verify: (match) => atobSafe(match).includes('service_role'),
  },
  {
    name: 'Razorpay key secret',
    pattern: /\brzp_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: 'Supabase anon/service key assignment with a real value',
    pattern: /SUPABASE_(SERVICE_ROLE|ANON)_KEY\s*=\s*[A-Za-z0-9._-]{40,}/,
  },
];

function atobSafe(text) {
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

let files = [];
try {
  files = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
} catch {
  console.error('Could not list tracked files with git. Run this from inside the repository.');
  process.exit(1);
}

const problems = [];

for (const file of files) {
  // Environment templates are allowed to hold placeholders, not real values.
  const isTemplate = file.endsWith('.example') || file.endsWith('.template');
  let contents;
  try {
    contents = readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    continue;
  }

  for (const { name, pattern, verify } of PATTERNS) {
    const match = pattern.exec(contents);
    if (!match) continue;
    if (verify && !verify(match[0])) continue;

    // In a template file, a value that looks like a real key is still wrong,
    // so both cases are reported, with clearer wording for templates.
    problems.push({
      file,
      name,
      isTemplate,
    });
  }
}

if (problems.length === 0) {
  console.log(`check:secrets - scanned ${files.length} tracked files, no secrets found.`);
  process.exit(0);
}

console.error(`check:secrets - found ${problems.length} potential secret(s):\n`);
for (const problem of problems) {
  console.error(`  ${problem.file}: looks like a real ${problem.name}`);
  if (problem.isTemplate) {
    console.error('    -> this is a template file, it must contain placeholders only');
  }
}
console.error(
  '\nIf a key was committed by accident, rotating it in the provider dashboard is the\n' +
    'only reliable fix. Removing it from the latest commit is not enough: it stays in\n' +
    'git history and can still be read.'
);

process.exit(1);