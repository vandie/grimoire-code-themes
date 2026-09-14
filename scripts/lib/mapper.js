/**
 * Adjusts hex colour lightness by a percentage for dynamic accent generation.
 */
export function adjustLightness(hex, percent) {
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

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Searches tokenColors scopes for syntax foreground colours.
 */
export function findScopeForeground(tokenColors, scopeList) {
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

/**
 * Maps VS Code theme tokens and syntax colours to Grimoire theme palette.
 */
export function mapVsCodeToGrimoire(themeData, options = {}, sourceUrl = '') {
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

  // Surface tokens - grab fallback shades if VS Code keys are absent
  const bgDeep = colors['editor.background'] || colors['panel.background'] || colors['sideBar.background'] || (isLight ? '#ffffff' : '#1e1e1e');
  const bgPanel = colors['sideBar.background'] || colors['activityBar.background'] || colors['editorGroupHeader.tabsBackground'] || bgDeep;
  const bgCard = colors['editorWidget.background'] || colors['sideBarSectionHeader.background'] || colors['menu.background'] || bgPanel;
  const bgCardHover = colors['list.hoverBackground'] || colors['list.activeSelectionBackground'] || colors['menu.selectionBackground'] || (isLight ? '#e8e8e8' : '#2a2d2e');
  const bgInput = colors['input.background'] || colors['dropdown.background'] || bgDeep;

  // Border tokens
  const border = colors['sideBar.borderColor'] || colors['panel.borderColor'] || colors['editorGroup.borderColor'] || colors['focusBorder'] || (isLight ? '#d4d4d4' : '#454545');
  const borderLight = colors['dropdown.border'] || colors['input.border'] || border;

  // Accent tokens - dynamically compute dim/bright shades if explicit keys are missing
  const accent = colors['activityBar.activeBorder'] || colors['focusBorder'] || colors['button.background'] || colors['activityBarBadge.background'] || '#007acc';
  const accentDim = colors['button.secondaryBackground'] || adjustLightness(accent, isLight ? 15 : -15);
  const accentBright = colors['button.hoverBackground'] || adjustLightness(accent, isLight ? -15 : 15);
  const accentAlt = colors['activityBarBadge.background'] || colors['textLink.foreground'] || colors['statusBar.background'] || '#0098ff';
  const onAccent = colors['button.foreground'] || colors['activityBarBadge.foreground'] || (isLight ? '#ffffff' : '#000000');

  // Text tokens
  const text = colors['editor.foreground'] || colors['foreground'] || (isLight ? '#000000' : '#d4d4d4');
  const textDim = colors['sideBar.foreground'] || colors['titleBar.activeForeground'] || (isLight ? '#333333' : '#cccccc');
  const textMuted = colors['editorLineNumber.foreground'] || colors['descriptionForeground'] || colors['disabledForeground'] || '#858585';

  // Status & Syntax content tokens
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

  // UI overlays & scrims
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
