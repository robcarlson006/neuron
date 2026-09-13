# Linked Class Folder Auto-Sync Design Specification

## Overview
Neuron allows students to link a local folder on their computer (e.g. `~/Documents/Bio101`) to a class/subject. When new course documents (PDFs, slide decks, Word documents, Markdown notes, etc.) are saved, downloaded, or dropped into that folder or any of its subfolders, Neuron automatically detects, parses, and adds them into the class's Materials list with real-time UI updates and non-intrusive toast notifications.

## Key Requirements & User Decisions
1. **Ingestion Behavior:** Automatic import of study materials only. When a new file is detected, it is parsed and saved as a Material. Flashcard generation and syllabus updates remain user-triggered with one click.
2. **Subfolder Organization:** Full recursive scanning. Subfolder paths are preserved in the material's relative name (e.g. `Week 1 / Lecture 1.pdf`) to maintain contextual organization.
3. **Safe Sync (Modifications & Deletions):**
   - **Modified files:** Detected via modified timestamp (`mtime`) and size; re-parsed and updated in the database.
   - **Deleted / moved files:** Retained in Neuron's database to protect study cards, AI tutor memories, and student annotations from accidental loss.
4. **Placement & Cardinality:** 1 primary linked folder per class. Accessible directly in the class Materials tab and during the Class Creation Wizard.

---

## Architecture & Subsystems

### 1. Data Model & SQLite Schema
The SQLite database schema (`src/lib/db.ts`) will be extended via versioned migrations:

#### `subjects` Table
- `linked_folder_path TEXT DEFAULT NULL` — The absolute directory path linked to this subject.
- `folder_last_synced_at TEXT DEFAULT NULL` — ISO timestamp of the last successful synchronization.
- `folder_sync_status TEXT DEFAULT 'idle' CHECK (folder_sync_status IN ('idle', 'syncing', 'error'))` — Current sync state.

#### `materials` Table
- `file_mtime INTEGER DEFAULT NULL` — File modification timestamp in milliseconds.
- `file_size INTEGER DEFAULT NULL` — File size in bytes.
- `relative_path TEXT DEFAULT NULL` — Relative path from the linked folder root (e.g. `Week 2/Slides.pptx`).

#### Cascade Deletion
- When a subject is deleted via `deleteSubjectCascade()`, the active file watcher for that subject is closed and removed from the watcher registry before removing database rows.

---

### 2. Electron Main Process Service (`FolderSyncService`)
Location: `electron/ipc/folderSyncService.ts`

#### Lifecycle & Startup
- **Startup Sweep:** When the Electron app boots (`main.ts`), `FolderSyncService.init(db, mainWindowGetter)` iterates through all subjects with `linked_folder_path IS NOT NULL`.
- If the folder exists, an immediate startup sweep runs to catch any files added or modified while Neuron was closed or during system sleep.
- An `fs.FSWatcher` is instantiated via `fs.watch(folderPath, { recursive: true })` and stored in a registry `Map<number, fs.FSWatcher>`.

#### Debouncing & File Stability
- When file system change events are received, the file path is added to an ingestion queue with a 1500ms debounce timer.
- Before parsing, the service checks that the file size is stable and that the file is not locked by an ongoing download.
- Temporary download extensions (e.g. `.crdownload`, `.download`, `.tmp`) and hidden/system files (`.DS_Store`, `._*`, `~$*`) are excluded.

#### Supported File Extensions
`.pdf`, `.docx`, `.doc`, `.pptx`, `.ppt`, `.txt`, `.md`, `.markdown`, `.rtf`, `.html`, `.csv`.

#### Ingestion & Change Detection
For each supported file:
1. Normalize path and compute relative path from folder root.
2. Query `materials` where `subject_id = ? AND (file_path = ? OR relative_path = ?)`.
3. If not found: Parse document text using `parseFileToText()` from `documentParser.ts`, insert row into `materials`.
4. If found: Compare disk `mtime` and `size` with stored values. If changed, re-parse and update `content_text`, `file_mtime`, `file_size`. If unchanged, skip.
5. Record `folder_last_synced_at` on the subject.
6. Push a `folder:sync-event` to the renderer with details of added and updated files.

---

### 3. IPC Layer & Preload APIs

#### IPC Handlers (`electron/ipc/folderHandlers.ts`)
- `folder:selectDialog` — Calls `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`.
- `folder:link(subjectId, folderPath)` — Validates directory, updates database, starts watcher, executes initial sync, returns result.
- `folder:unlink(subjectId)` — Closes watcher, sets `linked_folder_path = NULL`.
- `folder:syncNow(subjectId)` — Runs an on-demand immediate rescan.
- `folder:openFolder(folderPath)` — Opens the directory in the OS file manager (`shell.openPath`).

#### Preload API (`electron/preload.ts`)
- `window.electronAPI.selectFolderDialog(): Promise<string | null>`
- `window.electronAPI.linkFolderToClass(subjectId: number, folderPath: string): Promise<FolderSyncResult>`
- `window.electronAPI.unlinkFolderFromClass(subjectId: number): Promise<{ success: boolean }>`
- `window.electronAPI.syncClassFolder(subjectId: number): Promise<FolderSyncResult>`
- `window.electronAPI.openFolder(folderPath: string): Promise<void>`
- `window.electronAPI.onFolderSync(callback: (event: FolderSyncEvent) => void): () => void`

---

### 4. UI & Interaction Design

#### Class Materials Tab (`src/pages/UnifiedSubjectDetail.tsx`)
- **Unlinked State:** A secondary button `"Link Folder"` in the header next to `"Add Material"`.
- **Linked State:** A dedicated **Linked Folder Bar** displaying:
  - Folder name with folder icon and hover tooltip for full path.
  - Active status indicator (green pulse dot: "Watching").
  - "Last synced: Just now" (or relative time).
  - Quick action buttons: **Sync Now** (refresh icon with spinning state), **Open in Finder** (external link icon), and **Unlink** (with confirmation dialog).
- **Material List:** Items display their `relative_path` (e.g. `Week 1 / Lecture 1.pdf`) with a folder badge.
- **Live Sync Listener:** Uses `onFolderSync` to refresh materials list in-place and display toast when background sync ingests new files.

#### Class Creation Wizard (`src/pages/classes/ClassCreationWizard.tsx`)
- Step 2 (Materials) includes an action to `"Link Local Folder"`.
- Selecting a folder populates the initial file list with all detected documents and saves `linked_folder_path` when creating the class.

---

## Edge Case Handling & Resilience
1. **Missing or Renamed Directory:** If a linked folder cannot be accessed, the service marks `folder_sync_status = 'error'` and UI displays a warning banner allowing the user to relink or unlink without crashing.
2. **Slow/Interrupted Downloads:** 1500ms debounce ensures partially written files are not parsed mid-download.
3. **Corrupted File Parsing:** Isolated per-file `try/catch` in `parseFileToText()` logs errors and skips or records placeholders so remaining files sync smoothly.
4. **Duplicate Prevention:** Strict keying on subject ID and normalized relative path avoids duplicate material entries.
5. **App Lifecycle:** All active watchers cleanly shut down on app quit (`app.on('before-quit')`).

---

## Verification & Testing Plan

### Automated Tests
- `tests/unit/folderSyncService.test.ts`:
  - Verify recursive directory walking and file filtering.
  - Verify new file detection and database insertion.
  - Verify modification detection via `mtime`/size and re-parsing.
  - Verify safe sync: removing files on disk does not delete materials in DB.
  - Verify watcher start, unlink, and subject cascade cleanup.

### Manual Verification
1. Create a test class and link a local folder on macOS.
2. Drop a PDF into the folder; verify it appears in Neuron within 2 seconds with a toast notification.
3. Drop a subfolder containing a `.docx` file; verify it appears with relative subfolder path.
4. Edit a text file in the folder; verify updated content reflected in Neuron.
5. Delete a file in the folder; verify the material remains intact in Neuron.
6. Restart Neuron; verify startup sweep catches any offline changes and re-establishes watching.
