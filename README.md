<p align="center">
  <img src="icons/icon-192.png" width="96" height="96" alt="E-Künye icon">
</p>

<h1 align="center">E-Künye</h1>

<p align="center">Tap-to-copy personal info, right on your phone.</p>

---

E-Künye keeps the details you keep typing into forms, such as addresses, IBANs, ID numbers and emergency contacts, in one clean list. Tap a line to copy it, hold it to edit.

Available in Turkish and English.

## Features

- **Tap to copy, hold to edit.** On desktop, right-click or press <kbd>E</kbd> to edit.
- **Ready-made fields in groups:** my details, family, spouse, special dates, home and bills, car, and health and emergency. Each field comes with a matching emoji, input hint and keyboard type.
- **Fully editable:** rename, delete or re-emoji any field, or add your own.
- **Hide in list:** sensitive values such as IBANs, ID numbers and Wi-Fi passwords show as dots but still copy on tap.
- **Backup and restore:** export the whole list as a JSON file (through the share sheet where the browser supports it) and restore it on any device.
- **Turkish and English:** picks the browser language on first launch and can be switched under Settings. Built-in field names follow the language; fields you renamed stay as they are.
- **Installable and offline:** add it to the home screen on Android or iOS. It works without a connection after the first visit.

## Privacy

Your data never leaves the device. It lives in the browser's `localStorage` on that device. There is no server, account or sync.

This means clearing browser data or switching phones will lose the list unless you have a backup. Installing to the home screen makes storage more durable, especially on iOS. Backup files are plain JSON and are not encrypted, so keep them somewhere safe.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page markup; text is filled in from the language files |
| `css/style.css` | Styles |
| `js/app.js` | App logic: list, editor, backup, install hint, language switch |
| `lang/tr.js`, `lang/en.js` | All interface text, preset field names and hints, one file per language |
| `manifest.webmanifest` | PWA manifest (name, colors, icons) |
| `sw.js` | Service worker: caches the app shell and Google Fonts for offline use |
| `icons/` | App icons (192, 512 and maskable, plus the Apple touch icon) |

There are no dependencies and no build step.

## Adding a language

1. Copy `lang/en.js` to `lang/xx.js`, change `.en` to `.xx` on the first line and translate the values. Keep every key.
2. Add `<script src="lang/xx.js"></script>` to `index.html` before `js/app.js`.
3. Add `"./lang/xx.js"` to `ASSETS` in `sw.js` and bump `CACHE`.

The new language then shows up in the Settings switch automatically.

## Running locally

Serve the folder over `localhost`, because service workers only run on HTTPS or `localhost`:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from disk also works, but without offline support.

## Deploying

Any static host works, for example GitHub Pages serving the `main` branch from the root folder.

When you change any cached file (anything listed in `ASSETS`), bump `CACHE` in `sw.js` (for example `e-kunye-v6` to `e-kunye-v7`) so installed apps pick up the update.

## Data format

Each entry is stored as:

```json
{ "id": "…", "emoji": "🏠", "title": "Ev adresi", "value": "…", "hidden": false }
```

Every record loaded from storage or a backup passes through `normalizeItem`, so older data keeps loading safely. When extending the format, only add fields with defaults; never rename a field or make one required.
