# Release & Auto-Update Workflow

This document explains how to publish new versions of Neuron and how end users receive automatic updates.

---

## For Maintainers: How to Cut a Release

### Option 1: Version bump and push (Recommended)

1. **Update the version** in `package.json`:
   ```bash
   npm version patch   # e.g., 3.1.0 → 3.1.1 (bug fixes)
   npm version minor   # e.g., 3.1.0 → 3.2.0 (new features)
   npm version major   # e.g., 3.1.0 → 4.0.0 (breaking changes)
   ```
   This automatically updates `package.json` and creates a git commit & tag (`v3.1.1`).

2. **Push to GitHub** (including tags):
   ```bash
   git push origin main --tags
   ```

3. **CI handles the rest automatically:**
   - GitHub Actions checks if the release for the new version exists on GitHub.
   - A dedicated GitHub Release `vX.Y.Z` is created with auto-generated release notes.
   - Builds macOS (Apple Silicon arm64 + Intel x64 DMG & ZIP), Windows (NSIS `.exe`), and Linux (`.AppImage`).
   - Attaches all binary installers and updater metadata directly to the release.

### Option 2: Push a tag directly

```bash
git tag v3.2.0
git push origin v3.2.0
```

### Option 3: Manual workflow dispatch

Go to GitHub → **Actions** → **"Build & Release"** → **"Run workflow"** → select branch.

---

## For End Users: How Updates Work

### First-Time Installation
1. Visit the [latest GitHub Release](https://github.com/robmcarlson006/neuron/releases/latest).
2. Download the installer for the user's platform:
   - **macOS (Apple Silicon):** `Neuron-<version>-arm64.dmg`
   - **macOS (Intel):** `Neuron-<version>-x64.dmg`
   - **Windows:** `Neuron-Setup-<version>.exe`
   - **Linux:** `Neuron-<version>.AppImage`
3. Drag to Applications on macOS, or run the installer on Windows/Linux.

### Automatic In-App Updates
- **Automatic Background Checks**:
  - The app automatically queries GitHub Releases for updates 5 seconds after startup, and every 2 hours while running.
- **Update Notification & Progress**:
  - When an update is detected, an in-app banner appears: **"⬆ Neuron vX.Y.Z is available"**.
  - Clicking **"Update Now"** downloads the update in the background with a live percentage progress bar.
  - When finished, the button changes to **"Restart & Update"**.
- **One-Click Seamless Installation**:
  - **macOS**: An automated background script mounts the downloaded DMG, cleanly replaces `/Applications/Neuron.app`, removes quarantine flags, unmounts the volume, cleans up the temporary installer, and relaunches the updated app.
  - **Windows**: Opens the NSIS installer and relaunches.
  - **Linux**: Opens the new AppImage.
- **Manual Checks**:
  - Users can also check for updates, view release notes, and switch architecture preferences anytime in **Settings > Updates**.

---

## Auto-Update Technical Summary

| Component | Description |
|-----------|-------------|
| **Update Source** | GitHub Releases API (`robmcarlson006/neuron`) |
| **Check Frequency** | On launch (5s delay) + every 2 hours + manual trigger in Settings |
| **Download Target** | User's Downloads directory (`Neuron-<version>-update.dmg`/`exe`/`AppImage`) |
| **Installation Method** | Native platform helper (DMG mount/atomic swap on macOS, NSIS on Windows) |
| **Unsigned Compatibility** | Fully supported without requiring Apple Developer cert or Squirrel.Mac signing locks |

---

## Quick Reference Commands

```bash
# Bump version & tag & push
npm version patch && git push origin main --tags

# Build locally (macOS)
npm run build

# Install local build to /Applications
npm run install-app

# Run all automated tests
npm test

# Run TypeScript typechecks
npm run typecheck
```