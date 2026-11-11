// Files that Remotion Cloud installs into the user's renderer repository.
// NOTE: GitHub expression syntax is built with e() so it never collides with
// JavaScript template-literal substitution.

const e = (expr: string): string => '$' + '{{ ' + expr + ' }}';

export const WORKFLOW_YAML = String.raw`
name: Render
run-name: render-${e('inputs.job_id')}

on:
  workflow_dispatch:
    inputs:
      job_id:
        description: Job id
        required: true
        type: string
      composition:
        description: Composition id (empty = auto-detect)
        required: false
        default: ''
        type: string
      title:
        description: Output file name
        required: false
        default: ''
        type: string

permissions:
  contents: write

jobs:
  render:
    runs-on: ubuntu-latest
    timeout-minutes: 180
    env:
      JOB_ID: ${e('inputs.job_id')}
      COMPOSITION: ${e('inputs.composition')}
      TITLE: ${e('inputs.title')}
      GH_TOKEN: ${e('github.token')}
      REPO: ${e('github.repository')}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Prepare project
        run: |
          set -eu
          if [ ! -f "jobs/$JOB_ID/input.zip" ]; then
            echo "jobs/$JOB_ID/input.zip not found"
            exit 1
          fi
          mkdir -p work
          unzip -q "jobs/$JOB_ID/input.zip" -d work
          PKG=$(find work -name package.json -not -path '*/node_modules/*' -not -path '*/__MACOSX/*' | awk -F/ 'NR==1 || NF<m {m=NF; b=$0} END {print b}')
          if [ -z "$PKG" ]; then
            echo "package.json not found in the zip"
            exit 1
          fi
          ROOT=$(dirname "$PKG")
          echo "ROOT=$ROOT" >> "$GITHUB_ENV"
          echo "Project root: $ROOT"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: System libraries
        run: |
          sudo apt-get update -y >/dev/null 2>&1 || true
          for p in libnss3 libdbus-1-3 libatk1.0-0t64 libatk1.0-0 libatk-bridge2.0-0t64 libatk-bridge2.0-0 libasound2t64 libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libgbm1 libcups2t64 libcups2 libpango-1.0-0 libcairo2; do
            sudo apt-get install -y "$p" >/dev/null 2>&1 || true
          done

      - name: Install dependencies
        run: |
          set -e
          cd "$ROOT"
          if [ -f pnpm-lock.yaml ]; then
            npm install -g pnpm
            pnpm install
          elif [ -f yarn.lock ]; then
            npm install -g yarn
            yarn install
          elif [ -f package-lock.json ]; then
            npm ci || npm install
          else
            npm install --no-audit --no-fund
          fi

      - name: Detect composition
        run: |
          set -e
          cd "$ROOT"
          node "$GITHUB_WORKSPACE/.remotion-cloud/detect.mjs" "$PWD" "$COMPOSITION"

      - name: Render video
        run: |
          set -e
          cd "$ROOT"
          mkdir -p out
          echo "Entry: $ENTRY  Composition: $COMP"
          npx remotion render "$ENTRY" "$COMP" out/video.mp4 --concurrency="$(nproc)" --timeout=120000

      - name: Publish release
        run: |
          set -e
          cd "$ROOT"
          NAME=$(printf '%s' "$TITLE" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-60)
          if [ -z "$NAME" ]; then
            NAME=video
          fi
          cp out/video.mp4 "out/$NAME.mp4"
          gh release create "render-$JOB_ID" "out/$NAME.mp4" --repo "$REPO" --target "$GITHUB_SHA" --title "render-$JOB_ID" --notes "Rendered by Remotion Cloud (composition: $COMP)"

      - name: Remove uploaded zip
        if: always()
        continue-on-error: true
        run: |
          for i in 1 2 3; do
            SHA=$(gh api "repos/$REPO/contents/jobs/$JOB_ID/input.zip" --jq .sha 2>/dev/null || true)
            if [ -z "$SHA" ]; then
              break
            fi
            if gh api -X DELETE "repos/$REPO/contents/jobs/$JOB_ID/input.zip" -f message="Clean up $JOB_ID" -f sha="$SHA" >/dev/null 2>&1; then
              break
            fi
            sleep 3
          done
`.replace(/^\n/, '');

export const DETECT_SCRIPT = String.raw`
// Finds the Remotion entry file and composition id of an unpacked project.
// Usage: node detect.mjs <projectRoot> [forcedCompositionId]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(process.argv[2] || '.');
const forcedComp = (process.argv[3] || '').trim();

function fail(message) {
  console.error('ERROR: ' + message);
  process.exit(1);
}

function isFile(rel) {
  const full = path.join(root, rel);
  return fs.existsSync(full) && fs.statSync(full).isFile();
}

function fromScripts(pkg) {
  for (const cmd of Object.values(pkg.scripts || {})) {
    const tokens = String(cmd).split(/\s+/).filter(Boolean);
    const i = tokens.indexOf('render');
    if (i < 1 || !/remotion/.test(tokens[i - 1])) continue;
    const positional = tokens.slice(i + 1).filter((t) => !t.startsWith('-'));
    if (positional.length && isFile(positional[0])) {
      return { entry: positional[0], comp: positional[1] || '' };
    }
  }
  return { entry: '', comp: '' };
}

const CANDIDATES = [
  'src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx',
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'src/entry.ts', 'src/entry.tsx', 'remotion/index.ts', 'remotion/index.tsx',
];

function findByRegisterRoot(dir, depth) {
  if (depth > 3) return '';
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'out' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const found = findByRegisterRoot(full, depth + 1);
      if (found) return found;
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) {
      if (fs.readFileSync(full, 'utf8').includes('registerRoot(')) {
        return path.relative(root, full);
      }
    }
  }
  return '';
}

function listCompositions(entry) {
  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' };
  let out = '';
  try {
    out = execFileSync('npx', ['remotion', 'compositions', entry], {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    });
  } catch (err) {
    console.error(String(err.stdout || ''));
    console.error(String(err.stderr || ''));
    fail('Could not list compositions.');
  }
  const clean = out.replace(/\u001b\[[0-9;]*m/g, '');
  const ids = [];
  for (const line of clean.split('\n')) {
    const m = line.trim().match(/^(\S+)\s+[0-9.]+\s+[0-9]+x[0-9]+/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(pkgPath)) fail('package.json not found in ' + root);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let { entry, comp } = fromScripts(pkg);
if (!entry) entry = CANDIDATES.find(isFile) || '';
if (!entry) entry = findByRegisterRoot(root, 0);
if (!entry) fail('Could not find the Remotion entry file (the one that calls registerRoot).');

let composition = forcedComp || comp;
if (!composition) {
  const ids = listCompositions(entry);
  if (!ids.length) fail('No compositions found in ' + entry);
  composition = ids[0];
  if (ids.length > 1) {
    console.log('Several compositions found: ' + ids.join(', ') + '. Rendering ' + composition + '.');
  }
}

console.log('Entry: ' + entry);
console.log('Composition: ' + composition);

if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, 'ENTRY=' + entry + '\n' + 'COMP=' + composition + '\n');
}
`.replace(/^\n/, '');
