# Electron E2E suites

`npm run test:e2e` is the required release-confidence gate. It runs only
`required/**/*.spec.js`; every required test launches the real Electron main and
renderer through the shared fixture, uses an isolated user-data directory, and
must execute. The reporter fails a run that discovers no tests or skips the
whole matrix.

`npm run test:e2e:optional` runs the slower Electron accessibility, performance,
and theme suites selected by `playwright.optional.config.js`. They are useful
diagnostics, but are not part of the short local gate.

`npm run test:e2e:packaged` launches the executable named by
`NIGHTOWL_PACKAGED_APP`. This is a release-hardening check rather than part of
the default local gate because it requires a preceding package build. It verifies
that tutor-core can initialize and read its local writing pad without any
network provider while every mutable path remains under Electron `userData`.

The remaining root-level specs are quarantined legacy coverage. They mix normal
browser pages with Electron assumptions, use obsolete selectors, or duplicate
the required workflows. They are intentionally not selected by either config;
repair a test against the shared fixture before making it active again.
