# Grimoire Code Themes

A collection of colour themes for [Grimoire](https://github.com/grimoire-codex/grimoire) inspired by famous open-source coding themes and editor palettes (such as Dracula, Gruvbox, Panda Syntax, Solarized, and Tokyo Night).

## Installation & Usage

In Grimoire 1.7+, themes can be catalogued from custom add-on sources or imported directly as JSON.

### Adding as an Add-on Source (Recommended for Grimoire 1.7+)

1. In Grimoire, navigate to **Settings → Add-ons** (Admin access required).
2. Expand the **Add-on Sources** section.
3. Paste the raw index URL for this repository into the **Add Source** field:
   ```text
   https://raw.githubusercontent.com/vandie/grimoire-code-themes/main/themes/index.json
   ```
4. Click **Add Source**. Grimoire verifies the catalogue index and labels available content with a **themes** badge.
5. Account holders can now go to **Settings → Appearance**, click **Browse community themes**, and install any theme from this collection.

### Direct JSON Import (Manual)

1. Open any theme manifest under [`themes/`](themes/) (for example, [`themes/aura/aura.json`](themes/aura/aura.json)) and copy its full JSON payload.
2. In Grimoire, navigate to **Settings → Appearance**.
3. Click **Import a theme**, paste the JSON payload, and click **Install**.

## Available Themes

> [!NOTE]
> The **Author** column and manifest field reference the GitHub username of the original syntax theme's creator.

| Theme | Modes | Author | Description |
| --- | --- | --- | --- |
| [Aura](themes/aura/) | dark | [@DaltonMenezes](https://github.com/DaltonMenezes) | A beautiful dark theme for Visual Studio Code |
| [Dracula](themes/dracula/) | dark | [@zenorocha](https://github.com/zenorocha) | A dark theme for code editors and terminal emulators created by Zeno Rocha featuring a distinct purple and pastel accent color palette. |
| [Dracula At Night](themes/dracula-at-night/) | dark | [@bceskavich](https://github.com/bceskavich) | Dracula At Night — A Dracula fork, with a darker flavor |
| [Gruvbox](themes/gruvbox/) | light & dark | [@morhetz](https://github.com/morhetz) | Retro groove color scheme for Vim & modern code editors with warm earth tones, offering both dark and light variants. |
| [Panda Syntax](themes/panda/) | dark | [@siamak](https://github.com/siamak) | A super-minimal dark syntax theme designed for code editors featuring vibrant pink, cyan, and orange accents. |
| [Solarized](themes/solarized/) | light & dark | [@altercation](https://github.com/altercation) | Precision 16-color palette designed for use with terminal and GUI applications, offering both dark and light modes. |
| [Tokyo Night](themes/tokyo-night/) | dark | [@folke](https://github.com/folke) | A clean, dark Neovim & VS Code theme inspired by the lights of Tokyo at night. |

## Building & Contributing

Run `npm run build` (or `node build-index.js`) to validate theme manifests and update `themes/index.json`. Run `npm run check` to verify index currency.
