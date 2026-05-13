# macOS Distribution

NightOwl is configured for hardened-runtime builds through electron-builder.

Run the packaging preflight:

```bash
npm run dist:check
```

The check fails on missing package configuration or entitlement files. It only warns about missing local signing or notarization credentials unless you explicitly require them:

```bash
NIGHTOWL_REQUIRE_SIGNING_IDENTITY=1 npm run dist:check
NIGHTOWL_REQUIRE_NOTARIZATION_CREDS=1 npm run dist:check
```

Supported notarization credential sets:

- `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_ID`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

The mac build uses `build/entitlements.mac.plist` for both app and inherited helper entitlements.
