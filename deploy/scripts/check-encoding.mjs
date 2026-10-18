/**
 * Fail the build if any tracked text file contains mojibake.
 *
 * Windows PowerShell 5.1's Get-Content (and Set-Content) default to the ANSI code page,
 * so editing a UTF-8 file with it turns every em dash into "â€”" and every "×" into "Ã—".
 * That corruption is invisible in a diff, ships to the browser, and shows up as random
 * symbols on the live site. This gate catches it before the build does.
 *
 * Usage: node deploy/scripts/check-encoding.mjs [root]
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? '.';
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite', 'venv', '__pycache__']);
const EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml', '.css', '.html',
  '.py', '.sh', '.txt', '.svg', '.conf', '.toml', '.example', '',
]);

/** Sequences that only ever appear when UTF-8 was read as ANSI. */
const MARKERS = [
  ['â€”', 'em dash'],
  ['â€“', 'en dash'],
  ['â€¦', 'ellipsis'],
  ['â€™', 'right single quote'],
  ['â€œ', 'left double quote'],
  ['â€', 'double quote'],
  ['Â·', 'middle dot'],
  ['Â¦', 'broken bar'],
  ['Ã—', 'multiplication sign'],
  ['Ã¢â‚¬', 'double-encoded escape'],
];

const offenders = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;

    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }

    const dot = entry.name.lastIndexOf('.');

    if (!EXTENSIONS.has(dot === -1 ? '' : entry.name.slice(dot))) continue;

    const lines = (await readFile(path, 'utf8')).split('\n');

    lines.forEach((line, index) => {
      for (const [marker, label] of MARKERS) {
        if (line.includes(marker)) {
          offenders.push(`${relative(ROOT, path)}:${index + 1} ${label} -> ${line.trim().slice(0, 70)}`);
          break;
        }
      }
    });
  }
}

await walk(ROOT);

if (offenders.length > 0) {
  console.error(`\n${offenders.length} line(s) contain mangled text:\n`);

  for (const offender of offenders) console.error(`  ${offender}`);

  console.error(
    '\nRe-save the file as UTF-8. On Windows use the editor, not Get-Content/Set-Content in\n' +
      'PowerShell 5.1 — read with -Encoding UTF8 or use the Node/Python tooling instead.\n',
  );

  process.exit(1);
}

console.log('text encoding looks clean');
