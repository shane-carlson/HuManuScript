# Cloud agent — HuManuScript

## GitHub Actions (signed Mac DMG)

`git push` / `git pull` use Cursor’s GitHub App token. **`gh` and the Actions API use `GH_TOKEN`** (or `GITHUB_TOKEN`) from **Cloud Agent environment secrets**.

1. Create a **fine-grained PAT** on GitHub: **Settings → Developer settings → Fine-grained tokens**.
   - **Repository access:** `shane-carlson/HuManuScript` (or all repos you use with the same secret).
   - **Permissions:** **Actions** (read and write), **Contents** (read), **Metadata** (read). Add **Workflows** (read and write) if you push workflow files from the agent via `gh`.
2. In Cursor: **Cloud Agents → Environments → HuManuScript → Secrets**, add **`GH_TOKEN`** (exact name) with the PAT value.
3. From the agent or a terminal in this environment:

   ```bash
   npm run dispatch:pack-mac
   ```

   Or after a push to `main`, the workflow also runs automatically (see `.github/workflows/pack-mac.yml`).

Optional env vars:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITHUB_REPOSITORY` | `shane-carlson/HuManuScript` | Target repo |
| `PACK_MAC_REF` | `main` | Branch or tag to build |
| `PACK_MAC_WORKFLOW` | `pack-mac.yml` | Workflow file name |

Download the signed DMG from the run’s **Artifacts** tab on GitHub.
