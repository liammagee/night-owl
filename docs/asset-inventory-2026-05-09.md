# Asset Inventory

Tracked visual assets as of 2026-05-09:

| Path group | Purpose | Keep location |
| --- | --- | --- |
| `app-icon.svg` | Source app icon | Repo root is acceptable while packaging references it. |
| `build/icon.*` | Electron packaging icons | Keep in `build/`; `.gitignore` explicitly allows these files. |
| `styles/previews/*.png` | Built-in style preview thumbnails | Keep in `styles/previews/` as app resources. |
| `generated-images/generated_image_*.png` | User/generated image outputs | Move future outputs to user data or a user-selected workspace folder. Existing tracked files need product review before removal. |
| `generated_image_0.png`, `ENTER_FILE_NAME_0.png` | Legacy generated root images | Treat as cleanup candidates after confirming they are not referenced by docs, tests, or UI. |

Guardrails added in this pass:

- Removed tracked Playwright/test report artifacts from `playwright-report/`, `test-results/`, and `test-reports/`.
- Added `test-reports/` to `.gitignore`.
- Added `npm run quality:static` to fail if generated report/build/cache directories become tracked again.

Recommended follow-up:

- Change future AI image generation defaults to write under app user data or an explicit workspace export path.
- Remove the legacy root generated images if reference checks remain clean.
