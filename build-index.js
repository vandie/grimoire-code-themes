#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

function calculateSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function discoverThemes() {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true });
  const themes = [];
  const errors = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const themeDir = entry.name;
    const manifestPath = path.join(ROOT, themeDir, `${themeDir}.json`);

    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    let data;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      data = JSON.parse(raw);
    } catch (err) {
      errors.push(`${themeDir}/${themeDir}.json: invalid JSON: ${err.message}`);
      continue;
    }

    if (data.id !== themeDir) {
      errors.push(`${themeDir}/${themeDir}.json: id '${data.id}' does not match directory '${themeDir}'`);
      continue;
    }

    const variants = data.variants || {};
    let modes = ['light', 'dark'].filter((m) => Boolean(variants[m]));

    if (modes.length === 0) {
      if (!data.tokens) {
        errors.push(`${themeDir}/${themeDir}.json: a theme must set at least one token or variant`);
        continue;
      }
      modes = [data.mode];
    }

    const relPath = `${themeDir}/${themeDir}.json`;
    const themeEntry = {
      id: data.id,
      name: data.name,
      version: data.version,
      mode: data.mode,
      modes: modes,
      path: relPath,
      sha256: calculateSha256(manifestPath)
    };

    for (const optional of ['app_mode', 'author', 'description', 'homepage', 'grimoire_min_version']) {
      if (data[optional]) {
        themeEntry[optional] = data[optional];
      }
    }

    themes.push(themeEntry);
  }

  themes.sort((a, b) => a.id.localeCompare(b.id));

  return { themes, errors };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  const { themes, errors } = discoverThemes();

  if (errors.length > 0) {
    console.error('Validation failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const generated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const builtIndex = {
    version: 1,
    generated,
    themes
  };

  const indexPath = path.join(ROOT, 'index.json');

  if (checkOnly) {
    if (!fs.existsSync(indexPath)) {
      console.error('index.json is missing — run: node build-index.js');
      process.exit(1);
    }

    let committed;
    try {
      committed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (err) {
      console.error('index.json is invalid JSON — run: node build-index.js');
      process.exit(1);
    }

    const isStale = JSON.stringify(committed.themes) !== JSON.stringify(builtIndex.themes);

    if (isStale) {
      console.error('index.json is stale — run: node build-index.js');
      process.exit(1);
    }

    console.log('index.json is up to date.');
    process.exit(0);
  }

  fs.writeFileSync(indexPath, JSON.stringify(builtIndex, null, 2) + '\n');
  console.log(`Validated ${themes.length} theme(s) and wrote index.json successfully.`);
}

main();
