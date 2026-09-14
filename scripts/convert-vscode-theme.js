#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Grimoire-Theme-Converter/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function fetchUrlBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Grimoire-Theme-Converter/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrlBuffer(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function parseJsonc(jsonString) {
  const cleaned = jsonString
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^\\:])\/\/.*/g, '$1')
    .replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(cleaned);
}

function normalizeGithubUrl(urlStr) {
  let target = urlStr.trim();
  if (target.includes('github.com') && target.includes('/blob/')) {
    target = target
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
  return target;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function adjustLightness(hex, percent) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  let cleanHex = hex.slice(1);
  if (cleanHex.length === 3 || cleanHex.length === 4) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  if (cleanHex.length > 6) {
    cleanHex = cleanHex.slice(0, 6);
  }
  let num = parseInt(cleanHex, 16);
  if (isNaN(num)) return hex;

  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function findScopeForeground(tokenColors, scopeList) {
  if (!Array.isArray(tokenColors)) return null;
  for (const tc of tokenColors) {
    if (!tc || !tc.settings || !tc.settings.foreground) continue;
    const scopes = Array.isArray(tc.scope) ? tc.scope : typeof tc.scope === 'string' ? [tc.scope] : [];
    for (const targetScope of scopeList) {
      if (scopes.some((s) => s === targetScope || s.startsWith(targetScope + '.'))) {
        return tc.settings.foreground;
      }
    }
  }
  return null;
}

async function handleVscodethemesUrl(urlStr) {
  const match = urlStr.match(/vscodethemes\.com\/e\/([^.]+)\.([^/]+)(?:\/([^/]+))?/)
    || urlStr.match(/itemName=([^.]+)\.([^&]+)/);

  if (!match) return null;

  const publisher = match[1];
  const extensionName = match[2];
  const targetThemeSlug = match[3] || extensionName;

  console.log(`Resolving Open VSX extension for ${publisher}.${extensionName}...`);
  const apiUrl = `https://open-vsx.org/api/${publisher}/${extensionName}`;
  const apiJsonRaw = await fetchUrl(apiUrl);
  const apiData = JSON.parse(apiJsonRaw);

  const vsixUrl = apiData.files?.download || apiData.downloads?.universal;
  if (!vsixUrl) {
    throw new Error(`Could not find VSIX download URL for ${publisher}.${extensionName}`);
  }

  const tmpVsixPath = path.join(ROOT, `.tmp-${Date.now()}.vsix`);
  const tmpExtractDir = path.join(ROOT, `.tmp-${Date.now()}-ext`);

  console.log(`Downloading VSIX package from ${vsixUrl}...`);
  const vsixBuffer = await fetchUrlBuffer(vsixUrl);
  fs.writeFileSync(tmpVsixPath, vsixBuffer);

  execSync(`unzip -q "${tmpVsixPath}" -d "${tmpExtractDir}"`);

  const pkgJsonPath = path.join(tmpExtractDir, 'extension', 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error('Invalid VSIX package: package.json not found in extension/');
  }

  const pkgData = parseJsonc(fs.readFileSync(pkgJsonPath, 'utf8'));
  const themesContrib = pkgData.contributes?.themes || [];

  let selectedThemeContrib = themesContrib.find((t) => slugify(t.label || '') === slugify(targetThemeSlug))
    || themesContrib.find((t) => (t.path || '').includes(targetThemeSlug))
    || themesContrib[0];

  if (!selectedThemeContrib) {
    throw new Error(`No theme contribution found in VSIX package for ${targetThemeSlug}`);
  }

  const themeRelativePath = selectedThemeContrib.path.replace(/^\.\//, '');
  const themeFullPath = path.join(tmpExtractDir, 'extension', themeRelativePath);

  const themeRaw = fs.readFileSync(themeFullPath, 'utf8');

  // Cleanup temp files
  fs.rmSync(tmpVsixPath, { force: true });
  fs.rmSync(tmpExtractDir, { recursive: true, force: true });

  return {
    rawContent: themeRaw,
    name: selectedThemeContrib.label || pkgData.displayName || pkgData.name,
    author: publisher,
    homepage: urlStr,
    version: pkgData.version
  };
}

function mapVsCodeToGrimoire(themeData, options = {}, sourceUrl = '') {
  const colors = themeData.colors || {};
  const tokenColors = themeData.tokenColors || [];

  const rawName = options.name || themeData.name || themeData.displayName || 'Custom Theme';
  const themeId = options.id || slugify(rawName);
  const version = options.version || themeData.version || '1.0.0';
  const author = options.author || themeData.publisher || themeData.author || 'community';
  const description = options.description || themeData.description || `Theme auto-converted from ${rawName}.`;
  const appMode = options.appMode || themeData.app_mode || 'grimoire';
  const homepage = options.homepage || themeData.homepage || sourceUrl || undefined;

  const mode = (themeData.type || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
  const isLight = mode === 'light';

  const bgDeep = colors['editor.background'] || colors['panel.background'] || colors['sideBar.background'] || (isLight ? '#ffffff' : '#1e1e1e');
  const bgPanel = colors['sideBar.background'] || colors['activityBar.background'] || colors['editorGroupHeader.tabsBackground'] || bgDeep;
  const bgCard = colors['editorWidget.background'] || colors['sideBarSectionHeader.background'] || colors['menu.background'] || bgPanel;
  const bgCardHover = colors['list.hoverBackground'] || colors['list.activeSelectionBackground'] || colors['menu.selectionBackground'] || (isLight ? '#e8e8e8' : '#2a2d2e');
  const bgInput = colors['input.background'] || colors['dropdown.background'] || bgDeep;

  const border = colors['sideBar.borderColor'] || colors['panel.borderColor'] || colors['editorGroup.borderColor'] || colors['focusBorder'] || (isLight ? '#d4d4d4' : '#454545');
  const borderLight = colors['dropdown.border'] || colors['input.border'] || border;

  const accent = colors['activityBar.activeBorder'] || colors['focusBorder'] || colors['button.background'] || colors['activityBarBadge.background'] || '#007acc';
  const accentDim = colors['button.secondaryBackground'] || adjustLightness(accent, isLight ? 15 : -15);
  const accentBright = colors['button.hoverBackground'] || adjustLightness(accent, isLight ? -15 : 15);
  const accentAlt = colors['activityBarBadge.background'] || colors['textLink.foreground'] || colors['statusBar.background'] || '#0098ff';
  const onAccent = colors['button.foreground'] || colors['activityBarBadge.foreground'] || (isLight ? '#ffffff' : '#000000');

  const text = colors['editor.foreground'] || colors['foreground'] || (isLight ? '#000000' : '#d4d4d4');
  const textDim = colors['sideBar.foreground'] || colors['titleBar.activeForeground'] || (isLight ? '#333333' : '#cccccc');
  const textMuted = colors['editorLineNumber.foreground'] || colors['descriptionForeground'] || colors['disabledForeground'] || '#858585';

  const red = colors['errorForeground'] || findScopeForeground(tokenColors, ['invalid', 'keyword', 'markup.deleted']) || '#f48771';
  const green = colors['terminal.ansiGreen'] || findScopeForeground(tokenColors, ['string', 'markup.inserted']) || '#89d185';
  const blue = colors['terminal.ansiBlue'] || findScopeForeground(tokenColors, ['entity.name.function', 'support.function']) || '#3794ff';
  const warning = colors['editorWarning.foreground'] || findScopeForeground(tokenColors, ['constant.numeric', 'markup.changed']) || '#cca700';

  const typeBook = findScopeForeground(tokenColors, ['keyword.control', 'storage.type', 'entity.name.tag']) || '#c586c0';
  const typeMap = findScopeForeground(tokenColors, ['entity.name.function', 'support.function']) || '#569cd6';
  const typeToken = findScopeForeground(tokenColors, ['string', 'string.quoted']) || '#ce9178';
  const typeAudio = findScopeForeground(tokenColors, ['constant.numeric', 'number']) || '#b5cea8';
  const typeFile = findScopeForeground(tokenColors, ['variable', 'entity.name']) || '#9cdcfe';
  const variant = findScopeForeground(tokenColors, ['entity.name.type', 'support.type']) || accentAlt;

  const tagBg = colors['badge.background'] || bgCardHover;
  const tagBorder = colors['badge.foreground'] || border;
  const markBg = colors['editor.findMatchHighlightBackground'] || 'rgba(255, 235, 59, 0.35)';
  const inviteBg = colors['editor.selectionBackground'] || 'rgba(0, 122, 204, 0.2)';
  const overlay = colors['editorWidget.background'] || (isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)');
  const shadow = colors['widget.shadow'] || (isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)');

  const manifest = {
    $schema: 'https://raw.githubusercontent.com/grimoire-codex/community-add-ons/main/schema/theme.schema.json',
    id: themeId,
    name: rawName,
    version,
    mode,
    app_mode: appMode,
    author,
    description,
    homepage,
    variants: {
      [mode]: {
        'bg-deep': bgDeep,
        'bg-panel': bgPanel,
        'bg-card': bgCard,
        'bg-card-hover': bgCardHover,
        'bg-input': bgInput,
        border,
        'border-light': borderLight,
        accent,
        'accent-dim': accentDim,
        'accent-bright': accentBright,
        'accent-alt': accentAlt,
        'on-accent': onAccent,
        text,
        'text-dim': textDim,
        'text-muted': textMuted,
        red,
        green,
        blue,
        danger: red,
        'danger-fill': red,
        'on-danger': isLight ? '#ffffff' : '#000000',
        warning,
        success: green,
        'on-media': '#ffffff',
        'on-media-border': 'rgba(255, 255, 255, 0.4)',
        'tag-bg': tagBg,
        'tag-border': tagBorder,
        'mark-bg': markBg,
        'invite-bg': inviteBg,
        overlay,
        shadow,
        scrim: isLight ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.7)',
        'scrim-strong': isLight ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.9)',
        'type-book': typeBook,
        'type-map': typeMap,
        'type-token': typeToken,
        'type-audio': typeAudio,
        'type-file': typeFile,
        variant
      }
    }
  };

  return { themeId, manifest };
}

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
    extractedMeta = await handleVscodethemesUrl(url).catch(() => null);
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
}

main().catch((err) => {
  console.error(`Error converting theme: ${err.message}`);
  process.exit(1);
});
