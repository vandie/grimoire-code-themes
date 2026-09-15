#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const THEMES_DIR = path.join(ROOT, 'themes');

function calculateSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Scans the themes directory to discover valid theme manifests and calculate content hashes.
 */
function discoverThemes() {
  if (!fs.existsSync(THEMES_DIR)) {
    return { themes: [], errors: [] };
  }

  const entries = fs.readdirSync(THEMES_DIR, { withFileTypes: true });
  const themes = [];
  const errors = [];

  for (const entry of entries) {
    // Skip non-directories and hidden folders inside the themes directory
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const themeDir = entry.name;
    const manifestPath = path.join(THEMES_DIR, themeDir, `${themeDir}.json`);

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

/**
 * Formats theme metadata into markdown table rows for README documentation.
 */
function generateReadmeTable(themes) {
  const header = '| Theme | Modes | Author | Description |\n| --- | --- | --- | --- |';
  const rows = themes.map((t) => {
    const themeLink = `[${t.name}](themes/${t.id}/)`;
    const modesStr = Array.isArray(t.modes) ? t.modes.join(' & ') : (t.mode || 'dark');
    let authorStr = '—';
    if (t.author) {
      const cleanAuthor = t.author.startsWith('@') ? t.author.slice(1) : t.author;
      if (/^[a-zA-Z0-9-]+$/.test(cleanAuthor)) {
        authorStr = `[@${cleanAuthor}](https://github.com/${cleanAuthor})`;
      } else {
        authorStr = t.author;
      }
    }
    const descStr = t.description || '';
    return `| ${themeLink} | ${modesStr} | ${authorStr} | ${descStr} |`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Synchronises the available themes table in README.md with registered theme manifests.
 */
function updateReadme(themes, rootDir, checkOnly) {
  const readmePath = path.join(rootDir, 'README.md');
  if (!fs.existsSync(readmePath)) return false;

  const content = fs.readFileSync(readmePath, 'utf8');
  const newTable = generateReadmeTable(themes);

  // Match the markdown table block under ## Available Themes heading
  const tableRegex = /(\|\s*Theme\s*\|\s*Modes\s*\|[\s\S]*?)(?=\n\n## |\n\s*$)/;

  if (!tableRegex.test(content)) {
    console.warn('Could not locate Available Themes table in README.md to update.');
    return false;
  }

  const updatedContent = content.replace(tableRegex, newTable);
  const isStale = content !== updatedContent;

  if (checkOnly) {
    if (isStale) {
      console.error('README.md theme table is stale - run: node build-index.js');
    }
    return isStale;
  }

  if (isStale) {
    fs.writeFileSync(readmePath, updatedContent);
    console.log('Updated README.md theme table successfully.');
  }

  return false;
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
    $schema: "https://raw.githubusercontent.com/grimoire-codex/community-add-ons/main/schema/theme-index.schema.json",
    version: 1,
    generated,
    themes
  };

  const indexPath = path.join(THEMES_DIR, 'index.json');

  if (checkOnly) {
    if (!fs.existsSync(indexPath)) {
      console.error('themes/index.json is missing - run: node build-index.js');
      process.exit(1);
    }

    let committed;
    try {
      committed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (err) {
      console.error('themes/index.json is invalid JSON - run: node build-index.js');
      process.exit(1);
    }

    const isIndexStale = JSON.stringify(committed.themes) !== JSON.stringify(builtIndex.themes);
    const isReadmeStale = updateReadme(themes, ROOT, true);

    if (isIndexStale || isReadmeStale) {
      if (isIndexStale) console.error('themes/index.json is stale - run: node build-index.js');
      process.exit(1);
    }

    console.log('themes/index.json and README.md are up to date.');
    process.exit(0);
  }

  fs.mkdirSync(THEMES_DIR, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(builtIndex, null, 2) + '\n');
  console.log(`Validated ${themes.length} theme(s) and wrote themes/index.json successfully.`);
  updateReadme(themes, ROOT, false);
}

main();
