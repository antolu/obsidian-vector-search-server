
Release workflow — usage & testing (not a changelog)

This file documents the tag-triggered GitHub Actions release workflow at `.github/workflows/release.yml`. It is a workflow guide, not a release log.

Quick summary
- Push a tag (recommended format: `vMAJOR.MINOR.PATCH`); workflow runs and creates a GitHub Release with a compressed `dist` artifact.
- Major/minor releases (patch == 0) require an annotated tag with a non-empty message. Patch releases and `-dev` prereleases do not require a message.

Tagging examples
- Annotated major/minor (requires message):
  git tag -a v1.2.0 -m "Release notes for 1.2.0" && git push origin v1.2.0
- Lightweight patch (no message required):
  git tag v1.2.1 && git push origin v1.2.1
- Dev prerelease (no message required):
  git tag v1.0.0-dev0 && git push origin v1.0.0-dev0

What the workflow enforces
- If a tag contains `-dev` the tag is treated as a dev release and the annotated-message check is skipped.
- If the tag is semver `x.y.z` and `z == 0` (major/minor), the workflow requires the tag to be annotated (`git tag -a`) and to have a non-empty message; otherwise the job fails early.

Secrets & permissions
- No extra secrets required for the default flow: `GITHUB_TOKEN` (provided automatically to Actions) is sufficient to create releases and upload assets.
- If you later add npm publishing, you will need `NPM_TOKEN` or other registry tokens.

Testing the workflow safely
- Best safe approach: use a fork or temporary repository to push tags and verify the workflow behavior without affecting the main repo.
- To test in your repo but avoid disturbing `main` commits: push tags to a fork of the repo and inspect the fork's Actions UI.
- Quick local build check (pre-release verification): run the same build steps locally to ensure `pnpm build` succeeds before tagging:
  pnpm install --frozen-lockfile && pnpm build

Dry-run / manual testing options
- If you want a CI dry run that doesn't create a Release or upload assets, you can temporarily add/modify the workflow to read an environment variable (e.g. `DRY_RUN=true`) and skip the `create-release` / `upload-release-asset` steps.
- Alternatively add a separate debug workflow with `workflow_dispatch` that accepts a `tag` input and runs the release steps using that value (useful for manual runs from the Actions UI).

Troubleshooting
- If the job fails on "annotated tag" checks, ensure you created an annotated tag (not lightweight) and pushed it: `git tag -a vX.Y.Z -m "notes" && git push origin vX.Y.Z`.
- Check the Actions logs for the "Validate tag message" step for parsing details and helpful errors.

If you'd like, I can:
1) add a `workflow_dispatch` debug job to the workflow for manual tests, or
2) add a temporary `DRY_RUN` guard to skip creating the GitHub Release while you validate the rest of the steps.
