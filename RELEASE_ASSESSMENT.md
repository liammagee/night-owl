# NightOwl release readiness

Release readiness is a per-commit verification result, not a permanent project
status. The December 2024 checklist that previously lived here was superseded by
repository-owned checks and real source/packaged Electron workflows.

Use [`docs/development/BUILD_AND_RELEASE.md`](docs/development/BUILD_AND_RELEASE.md)
for the complete procedure. A release candidate is ready to tag only when all of
the following refer to the same commit:

- `npm run ci:local:release` passes from a clean worktree;
- the hosted `.github/workflows/electron-e2e.yml` job passes;
- a relevant unpacked application is built and `npm run test:e2e:packaged`
  passes against it;
- presentation and workplan generated outputs are current;
- package version, intended tag, and release notes agree;
- required platform signing/notarization credentials are present; and
- every expected platform artifact is inspected before announcement.

The local distribution check warns when signing or notarization credentials are
absent unless `NIGHTOWL_REQUIRE_SIGNING_IDENTITY=1` and
`NIGHTOWL_REQUIRE_NOTARIZATION_CREDS=1` make them mandatory. An unsigned build
that completes successfully is not evidence of a releasable macOS artifact.

Current bugs, risks, and enhancements belong in [`workplan/BOARD.md`](workplan/BOARD.md).
Do not add test counts or a standing “ready” claim here; both become stale as the
suite and product change.
