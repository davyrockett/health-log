# Health Log

A personal log of weigh-ins and medications (current and past).
It runs as an app on your iPhone's Home Screen and your Mac's Dock, works with no
signal, and keeps the phone and Mac in sync through a GitHub project.

**Live app:** https://davyrockett.github.io/health-log/ (open in Safari on iPhone → Share → Add to Home Screen)

This project holds only the app. Your entries live in the separate (public)
project `davyrockett/health-log-data` and on your devices.

## What's in here

| File | What it does |
|---|---|
| `index.html` | The page itself: tabs for Weight, Medications and Settings |
| `styles.css` | Colors, sizes, light/dark themes |
| `app.js` | The app's behavior |
| `db.js` | Saves data on the device (IndexedDB): weigh-ins and medications |
| `sync.js` | Keeps devices matched through the GitHub data project |
| `sw.js` | The "service worker": saves the app on the phone so it works offline |
| `manifest.webmanifest` | Tells the phone the app's name, icon, and to open full-screen |
| `icons/` | App icons (redraw with `python3 tools/make-icons.py`) |
| `private/` | **Never uploaded** (listed in `.gitignore`) |
| `Start Health Log.command` | Double-click to run a local test copy on this Mac |

## Using it

- **iPhone:** open the live app in Safari → Share → **Add to Home Screen**.
- **Mac:** open the live app in Safari → **File → Add to Dock**.
- **First time on each device:** Settings → **Sync** → paste your access key → Connect.
  Until you connect, the app is empty: the public link shows nothing to anyone without the key.

`Start Health Log.command` runs a local copy for testing changes before publishing.
Its data is separate from the live app.

## Publishing a change

1. Edit the files.
2. **In `sw.js`, bump `VERSION`** (v1 → v2 …) and match `APP_VERSION` in `app.js`.
   Without this, phones keep the old copy.
3. Commit and push (`git add -A && git commit -m "…" && git push`).
4. GitHub Pages updates within a minute or two. On the phone, open the app and
   an **Update** banner appears. Tap it.

## Your data and sync

Your data is stored on each device **and** in the public GitHub project
`davyrockett/health-log-data` (file `data.json`). Each device syncs when the app
opens, a moment after you save something, when the connection comes back, and
every couple of minutes while it's on screen. With no signal, everything is
saved on the device and syncs later.

- If the same item is edited on two devices, the most recent edit wins.
- Deletions sync too, so deleted items don't come back.
- GitHub keeps every sync as a version, so earlier versions of `data.json` can
  be recovered from the project's history.
- Anyone can read `data.json`; only the access key can change it. The key is
  stored only in that device's browser storage.
