# Releasing BioFmt

BioFmt is published to the VS Code Marketplace. Publishing is automated by a
tag-triggered GitHub Actions job (`.github/workflows/release.yml`); maintainers
only need to bump the version, document the changes, and push a tag.

## One-time setup

- A VS Code Marketplace publisher must exist matching the `publisher` field in
  `package.json` (currently `jfan`). Create it at
  <https://marketplace.visualstudio.com/manage> (or `npx vsce create-publisher <name>`),
  backed by an Azure DevOps organization. If the name is unavailable, change
  `publisher` in `package.json`.
- Generate a Personal Access Token scoped to **Marketplace › Manage** and store it
  as the `VSCE_PAT` secret in the GitHub repository settings
  (Settings → Secrets and variables → Actions).

## Cutting a release

1. Bump `version` in `package.json` (semver: a **minor** bump for new formats or
   features, a **patch** bump for fixes only).
2. Add a section for the new version to `CHANGELOG.md` (Keep a Changelog format).
3. Commit on a branch, open a PR, and merge once CI is green.
4. From an up-to-date `main`, tag and push:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

5. The `release` workflow builds the extension, publishes it to the Marketplace
   using `VSCE_PAT`, uploads the `.vsix` as a build artifact, and attaches it to
   the GitHub release.

## Local packaging (without publishing)

```bash
npm run build
npx vsce package --no-dependencies
```

produces a local `.vsix` for manual testing. Do not commit `.vsix` files
(they are gitignored).
