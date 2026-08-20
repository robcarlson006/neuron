# Release & Auto-Update Workflow

This document explains how to publish new versions of Neuron and how end users receive automatic updates.

---

## For Maintainers: How to Cut a Release

### Option 1: Version bump on `main` (Recommended)

1. **Update the version** in `package.json`:
   ```bash
   npm version patch   # 1.8.0 → 1.8.1 (bug fixes)
   npm version minor   # 1.8.0 → 1.9.0 (new features)
   npm version major   # 1.8.0 → 2.0.0 (breaking changes)
   ```
   This automatically:
   - Updates `package.json` version
   - Creates a git commit
   - Creates a git tag (`v1.8.1`, etc.)

2. **Push to GitHub** (including tags):
   ```bash
   git push origin main --tags
   ```

3. **CI does the rest:**
   - GitHub Actions detects the version change
   - Builds macOS (DMG + ZIP), Windows (NSIS .exe), Linux (AppImage)
   - Creates a GitHub Release with all artifacts attached
   - Publishes `latest.yml` / `latest-mac.yml` / `latest-linux.yml` for auto-updater

### Option 2: Push a tag directly

If you prefer manual tags without the `npm version` workflow:
```bash
git tag v1.8.1
git push origin v1.8.1
```

### Option 3: Manual workflow dispatch

Go to GitHub Actions → "Build & Release" → "Run workflow" → choose branch.

---

## For End Users: Getting Neuron

### First-time install
1. Go to the [latest GitHub Release](https://github.com/robcarlson006/neuron/releases/latest)
2. Download the installer for your platform:
   - **macOS (Apple Silicon):** `Neuron-<version>-arm64.dmg`
   - **Windows:** `Neuron-Setup-<version>.exe`
   - **Linux:** `Neuron-<version>.AppImage`
3. Install normally (drag to Applications on macOS, run installer on Windows/Linux)

### Automatic updates (after first install)
- **No action needed.** The app checks for updates on launch and every 4 hours.
- When a new version is available:
  - macOS: A notification appears → click "Download & Install" → app quits, updates, and relaunches
  - Windows: Installer opens → follow prompts → app restarts
- Updates are **delta downloads** (small, fast) using `electron-updater` + GitHub Releases

---

## Auto-Update Technical Details

| Component | Configuration |
|-----------|---------------|
| **Update server** | GitHub Releases (public repo) |
| **Check interval** | On launch + every 4 hours |
| **Download** | Background, with progress UI in Settings |
| **Install** | User-initiated (prompt to restart & install) |
| **Channel** | `latest.yml` (per-platform) from GitHub Release assets |

### Files published per release
- `Neuron-<version>-arm64.dmg` — macOS installer
- `Neuron-<version>-arm64-mac.zip` — macOS zip (for auto-updater)
- `latest-mac.yml` — Auto-updater manifest (macOS)
- `Neuron-Setup-<version>.exe` — Windows NSIS installer
- `latest.yml` — Auto-updater manifest (Windows)
- `Neuron-<version>.AppImage` — Linux
- `latest-linux.yml` — Auto-updater manifest (Linux)

---

## Code Signing & Gatekeeper / SmartScreen

### Current state: **Unsigned builds**

| Platform | Behavior |
|----------|----------|
| **macOS** | ⚠️ Gatekeeper blocks first launch → User must right-click → "Open" → "Open" |
| **Windows** | ⚠️ SmartScreen warns "Windows protected your PC" → "More info" → "Run anyway" |
| **Linux** | Works without signing (AppImage) |

### To eliminate warnings (future work)

#### macOS
1. **Apple Developer Program** ($99/year)
2. Get "Developer ID Application" certificate
3. Add to GitHub Secrets: `CSC_LINK` (base64 .p12), `CSC_KEY_PASSWORD`
4. Add notarization: `APPLE_ID`, `APPLE_ID_PASSWORD` (app-specific), `APPLE_TEAM_ID`
5. In `package.json` build config:
   ```json
   "mac": {
     "identity": "Developer ID Application: Your Name (TEAM_ID)",
     "hardenedRuntime": true,
     "gatekeeperAssess": false,
     "entitlements": "build/entitlements.mac.plist",
     "entitlementsInherit": "build/entitlements.mac.plist"
   }
   ```

#### Windows
1. **Code Signing Certificate** (~$200-400/year from DigiCert, Sectigo, etc.)
2. Add to GitHub Secrets: `CSC_LINK` (base64 .pfx), `CSC_KEY_PASSWORD`
3. In `package.json`:
   ```json
   "win": {
     "certificateFile": "cert.p12",
     "certificatePassword": "from_env"
   }
   ```

---

## Quick Reference Commands

```bash
# Bump version & tag
npm version patch && git push origin main --tags

# Build locally (macOS)
npm run build

# Install local build to /Applications
cp -fR dist/mac-arm64/Neuron.app /Applications/Neuron.app

# View current version
cat package.json | grep version

# Check GitHub Release assets
gh release view --json assets --jq '.assets[].name'
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "App can't be opened" (macOS) | Right-click app → Open → Open |
| "Windows protected your PC" | More info → Run anyway |
| Auto-updater doesn't see new release | Check `latest-mac.yml` exists in Release assets; verify version in `package.json` matches tag |
| Build fails on CI | Check Node version (20), `npm ci` cache, native module rebuild (better-sqlite3) |