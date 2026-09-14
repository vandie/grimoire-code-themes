/**
 * Strips block and line comments from JSONC strings (common in VS Code theme files).
 */
export function parseJsonc(jsonString) {
  // Strip block comments /* ... */ and line comments // ... to handle JSONC formatting
  const cleaned = jsonString
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^\\:])\/\/.*/g, '$1')
    .replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(cleaned);
}
