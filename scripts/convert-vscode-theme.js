#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { fetchUrl, normalizeGithubUrl, handleVscodethemesUrl } from './lib/fetcher.js';
import { parseJsonc } from './lib/parser.js';
import { mapVsCodeToGrimoire } from './lib/mapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let url = null;
  let file = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) url = args[++i];
    else if (args[i] === '--file' && args[i + 1]) file = args[++i];
    else if (args[i] === '--id' && args[i + 1]) options.id = args[++i];
    else if (args[i] === '--name' && args[i + 1]) options.name = args[++i];
    else if (args[i] === '--author' && args[i + 1]) options.author = args[++i];
    else if (args[i] === '--version' && args[i + 1]) options.version = args[++i];
    else if (args[i] === '--description' && args[i + 1]) options.description = args[++i];
    else if (args[i] === '--app-mode' && args[i + 1]) options.appMode = args[++i];
    else if (args[i] === '--homepage' && args[i + 1]) options.homepage = args[++i];
  }

  if (!url && !file) {
    console.error('Usage: node scripts/convert-vscode-theme.js --url <URL> [--id <id>] [--name <name>] [--author <author>]');
    console.error('       node scripts/convert-vscode-theme.js --file <path> [--id <id>]');
    process.exit(1);
  }

  let rawContent = '';
  let sourceUrl = url || file;
  let extractedMeta = null;

  if (url) {
    extractedMeta = await handleVscodethemesUrl(url, ROOT).catch(() => null);
    if (extractedMeta) {
      rawContent = extractedMeta.rawContent;
      if (!options.name && extractedMeta.name) options.name = extractedMeta.name;
      if (!options.author && extractedMeta.author) options.author = extractedMeta.author;
      if (!options.version && extractedMeta.version) options.version = extractedMeta.version;
      if (!options.homepage && extractedMeta.homepage) options.homepage = extractedMeta.homepage;
    } else {
      const targetUrl = normalizeGithubUrl(url);
      console.log(`Fetching theme from ${targetUrl}...`);
      rawContent = await fetchUrl(targetUrl);
    }
  } else {
    console.log(`Reading theme file ${file}...`);
    rawContent = fs.readFileSync(path.resolve(file), 'utf8');
  }

  const themeData = parseJsonc(rawContent);
  const { themeId, manifest } = mapVsCodeToGrimoire(themeData, options, sourceUrl);

  const targetDir = path.join(ROOT, themeId);
  fs.mkdirSync(targetDir, { recursive: true });

  const manifestPath = path.join(targetDir, `${themeId}.json`);
  const licensePath = path.join(targetDir, 'LICENSE');

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote theme manifest to ${manifestPath}`);

  if (!fs.existsSync(licensePath)) {
    const licenseText = `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${options.author || themeData.publisher || themeData.author || 'Theme Contributors'}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
    fs.writeFileSync(licensePath, licenseText);
    console.log(`Created default MIT LICENSE at ${licensePath}`);
  }

  console.log('Rebuilding index.json...');
  execSync('node build-index.js', { cwd: ROOT, stdio: 'inherit' });

  console.log(`Successfully converted and registered theme '${themeId}'!`);

  // Explicitly terminate process to prevent lingering HTTP socket keep-alive timers from hanging execution in CI
  process.exit(0);
}

main().catch((err) => {
  console.error(`Error converting theme: ${err.message}`);
  process.exit(1);
});
