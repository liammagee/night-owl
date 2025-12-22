## Plugin Development Workflow

This repository uses a related repository of plugins located in `~/Dev/techne-plugins`.

**IMPORTANT: `techne-plugins` is the source of truth for all plugin code.**

When making changes to plugins:
1. **Always make changes in `~/Dev/techne-plugins` first**
2. Then sync those changes to the consuming repos:
   - `~/Dev/my-website`
   - `~/Dev/hegel-pedagogy-ai`

Plugins must be synced across all three repositories:
- `~/Dev/techne-plugins` (source of truth)
- `~/Dev/my-website`
- `~/Dev/hegel-pedagogy-ai`

If you've made plugin changes in hegel-pedagogy-ai or my-website, copy them back to techne-plugins and then sync to the other repos to maintain consistency.

