import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { parseJsonc } from './parser.js';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Performs HTTP/HTTPS GET requests following redirects with socket timeout.
 */
export function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Grimoire-Theme-Converter/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    req.setTimeout(15000, () => {
      req.destroy(new Error(`Request timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

/**
 * Downloads binary buffer data over HTTP/HTTPS with socket timeout.
 */
export function fetchUrlBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Grimoire-Theme-Converter/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrlBuffer(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(15000, () => {
      req.destroy(new Error(`Request timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

/**
 * Converts GitHub blob URLs to raw usercontent URLs for direct fetching.
 */
export function normalizeGithubUrl(urlStr) {
  let target = urlStr.trim();
  if (target.includes('github.com') && target.includes('/blob/')) {
    target = target
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
  return target;
}

/**
 * Searches extracted VSIX package directories for original licence files.
 */
function findLicenceFile(extractDir) {
  const candidateDirs = [path.join(extractDir, 'extension'), extractDir];
  const candidateNames = ['license', 'license.md', 'license.txt', 'licence', 'licence.md', 'licence.txt'];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const name of candidateNames) {
      const match = entries.find((e) => e.toLowerCase() === name);
      if (match) {
        const fullPath = path.join(dir, match);
        if (fs.statSync(fullPath).isFile()) {
          return fs.readFileSync(fullPath, 'utf8');
        }
      }
    }
  }
  return null;
}

/**
 * Resolves Open VSX / vscodethemes.com extension links and unpacks the VSIX archive.
 */
export async function handleVscodethemesUrl(urlStr, rootDir) {
  const match =
    urlStr.match(/vscodethemes\.com\/e\/([^.]+)\.([^/]+)(?:\/([^/]+))?/) ||
    urlStr.match(/itemName=([^.]+)\.([^&]+)/);

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

  const tmpVsixPath = path.join(rootDir, `.tmp-${Date.now()}.vsix`);
  const tmpExtractDir = path.join(rootDir, `.tmp-${Date.now()}-ext`);

  console.log(`Downloading VSIX package from ${vsixUrl}...`);
  const vsixBuffer = await fetchUrlBuffer(vsixUrl);
  fs.writeFileSync(tmpVsixPath, vsixBuffer);

  // Unpack VSIX zip package using non-interactive flags (-o -q) to prevent CI hangs
  execSync(`unzip -o -q "${tmpVsixPath}" -d "${tmpExtractDir}"`);

  const pkgJsonPath = path.join(tmpExtractDir, 'extension', 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error('Invalid VSIX package: package.json not found in extension/');
  }

  const pkgData = parseJsonc(fs.readFileSync(pkgJsonPath, 'utf8'));
  const themesContrib = pkgData.contributes?.themes || [];

  const selectedThemeContrib =
    themesContrib.find((t) => slugify(t.label || '') === slugify(targetThemeSlug)) ||
    themesContrib.find((t) => (t.path || '').includes(targetThemeSlug)) ||
    themesContrib[0];

  if (!selectedThemeContrib) {
    throw new Error(`No theme contribution found in VSIX package for ${targetThemeSlug}`);
  }

  const themeRelativePath = selectedThemeContrib.path.replace(/^\.\//, '');
  const themeFullPath = path.join(tmpExtractDir, 'extension', themeRelativePath);
  const themeRaw = fs.readFileSync(themeFullPath, 'utf8');

  // Search package for existing licence documentation prior to temporary directory cleanup
  const licenceContent = findLicenceFile(tmpExtractDir);

  // Clean up temporary archive files
  fs.rmSync(tmpVsixPath, { force: true });
  fs.rmSync(tmpExtractDir, { recursive: true, force: true });

  return {
    rawContent: themeRaw,
    name: selectedThemeContrib.label || pkgData.displayName || pkgData.name,
    author: publisher,
    description: pkgData.description || apiData.description,
    homepage: urlStr,
    version: pkgData.version,
    licenceContent
  };
}
