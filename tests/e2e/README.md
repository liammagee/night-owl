# Electron E2E suites

`npm run test:e2e` is the required release-confidence gate. It runs only
`required/**/*.spec.js`; every required test launches the real Electron main and
renderer through the shared fixture, uses an isolated user-data directory, and
must execute. The reporter fails a run that discovers no tests or skips the
whole matrix.

`npm run test:e2e:optional` runs the slower Electron accessibility, performance,
and theme suites selected by `playwright.optional.config.js`. They are useful
diagnostics, but are not part of the short local gate.

The remaining root-level specs are quarantined legacy coverage. They mix normal
browser pages with Electron assumptions, use obsolete selectors, or duplicate
the required workflows. They are intentionally not selected by either config;
repair a test against the shared fixture before making it active again.
