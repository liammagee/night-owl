# Publishing profiles

NightOwl publishing profiles turn a multi-repository release into a visible,
finite workflow. Open **File → Publishing Workflows…** or run
**Publishing: Open Workflow** from the Command Palette.

The panel discovers declared sibling repositories, reports their branches,
origins, exact revisions, and changed paths, checks required tools, and shows
the complete command plan before running a stage. A stage is one of:

- `inspect`: local read-only preflight or preview;
- `network`: an explicitly requested read of remote deployment/live state; or
- `mutate`: a local or remote mutation, always protected by an app-native
  confirmation after the exact paths and commands are visible.

Commands are executable/argument vectors and run with `shell: false`. Profile
files cannot contain credential-shaped fields, cannot use absolute executable
paths, and can discover repositories only inside the current workspace's
portfolio parent. A reviewed plan is hashed with repository paths, revisions,
and working-tree state; any intervening edit makes the run stale and forces a
refresh.

## Workspace profile

Place a versioned profile at `.nightowl/publishing.json` in the primary
workspace. The schema is version 1:

```json
{
  "schemaVersion": 1,
  "profiles": [
    {
      "id": "docs-site",
      "title": "Documentation site",
      "repositories": [
        {
          "id": "content",
          "label": "Content",
          "expectedBasenames": ["docs-content"],
          "candidates": [".", "../docs-content"],
          "remote": "example/docs-content"
        }
      ],
      "stages": [
        {
          "id": "preflight",
          "label": "1. Preflight",
          "authority": "inspect",
          "requires": ["npm"],
          "steps": [
            {
              "id": "test-content",
              "type": "command",
              "repository": "content",
              "executable": "npm",
              "args": ["test"]
            }
          ]
        }
      ]
    }
  ]
}
```

Supported steps are `repository-status` and direct `command`. Command
executables may be an approved tool name or an executable path beginning `./`
inside the declared repository. Arguments and non-secret environment values
may use these placeholders:

- `{{message}}` — the release message entered in the panel;
- `{{repo.<id>.revision}}` — the exact inspected Git SHA; and
- `{{repo.<id>.path}}` — the resolved checkout path.

Use `messageRequired: true` when a stage needs a release message, and
`requiresCleanIndex: ["repository-id"]` when an owning publisher refuses or
could otherwise inherit pre-existing staged changes.

## Machine Spirits reference workflow

NightOwl bundles
`services/publishing-profiles/machinespirits.json`. It activates when the
workspace is one of the standard sibling checkouts:

1. **Preflight** inspects brand, content, and website state and runs the brand
   repository's disposable `./check` contract.
2. **Preview handoff** runs `./publish-to-content --dry-run`, reports changed
   content paths, and names the exact downstream content SHA.
3. **Publish content** requires a release message and explicit confirmation,
   then invokes the brand-owned wrapper. That wrapper renders, validates,
   stages only the public package surface, commits, rebases, and pushes.
4. **Deployment status** reads the website repository's deploy workflow. The
   website owns exact-revision discovery and scheduled drift deployment; the
   content repository no longer needs a cross-repository write credential.
5. **Verify live revision** passes the current full content SHA to the
   website-owned smoke script, which waits for `/api/health` to report that
   revision and checks public routes, private denials, and assets.

This keeps the useful three-repository ownership boundary while giving the
human author one IDE surface, one ordered checklist, and one audit trail of the
revision crossing each boundary.
