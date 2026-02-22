# NightOwl Browser Citation Capture

NightOwl now exposes a local capture bridge at:

- `http://127.0.0.1:27124/capture`

When NightOwl is open, browser tools can POST/GET citation text to this endpoint and it is imported through the same smart parser used by the Citations panel.

## 1) Bookmarklet (1 click)

1. Open the file `bookmarklet-source.js`.
2. Copy the single-line `javascript:(...)` code.
3. Create a browser bookmark and paste the code as the bookmark URL.
4. While viewing a paper page, Google Scholar BibTeX page, DOI page, or any citation text, click the bookmarklet.

What it sends:

- Detected BibTeX block from page text (if present), otherwise selection/title/url.

## 2) Chrome Extension (toolbar button)

Extension files are in:

- `chrome-extension/manifest.json`
- `chrome-extension/background.js`

Install locally:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select this folder: `integrations/citation-capture/chrome-extension`.
5. Click the extension toolbar icon on any citation page.

Behavior:

- Extracts citation text (BibTeX if found, else selected text/title/url).
- Sends it to `http://127.0.0.1:27124/capture` via POST.
- Shows success/failure feedback in the extension toolbar badge.

## 3) Firefox Extension (toolbar button)

Extension files are in:

- `firefox-extension/manifest.json`
- `firefox-extension/background.js`

Install locally:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `integrations/citation-capture/firefox-extension/manifest.json`.
4. Click the extension toolbar icon on any citation page.

Behavior:

- Extracts citation text (BibTeX if found, else selected text/title/url).
- Sends it to `http://127.0.0.1:27124/capture` via POST.
- Shows success/failure feedback in the extension toolbar badge.

## 4) In-app one-click export

From NightOwl:

1. Open Citations panel.
2. Click `Import`.
3. In Smart Import, click `Export Browser Bundles`.

NightOwl will package Chrome + Firefox extension bundles and open the output folder.

## 5) Direct API format

GET:

`/capture?text=...&title=...&url=...&source=...`

POST JSON:

```json
{
  "text": "@article{...}",
  "title": "Page Title",
  "url": "https://example.org/paper",
  "source": "extension"
}
```

## Troubleshooting

If Electron exits with `SIGKILL` and macOS crash reports mention code-signing invalid native modules, rebuild native dependencies:

```bash
npm run native:rebuild
```
