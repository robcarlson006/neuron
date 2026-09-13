# Linked Class Folder Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to link a local folder on their computer to any Neuron class, automatically detecting, parsing, and ingesting new and modified study materials into the class in real time.

**Architecture:** A dedicated `FolderSyncService` running in Electron's main process manages debounced OS file watchers (`fs.watch`) and startup sweeps for all linked classes. Documents (PDF, DOCX, PPTX, TXT, MD) are parsed via `documentParser.ts` and stored in SQLite `materials` with relative paths and modification timestamps. Real-time sync events push to the React renderer via IPC to refresh the Materials view and display notifications.

**Tech Stack:** TypeScript, Electron, Node.js (`fs`, `path`), SQLite (`better-sqlite3`), React 18, Tailwind CSS, Jest.

**Spec:** `docs/superpowers/specs/2026-09-13-linked-class-folder-sync-design.md`

## Global Constraints
- Node 20 / Electron 41 compatibility.
- Safe Sync: Files modified on disk are re-parsed; files deleted on disk are NEVER deleted from the SQLite database.
- 1500ms debounce before parsing to guarantee file write completion.
- Support nested subfolders with relative path labels (e.g. `Week 1 / Lecture 1.pdf`).
- Clean watcher lifecycle: No memory leaks or orphaned watchers on subject deletion, folder unlinking, or app shutdown.

---

### Task 1: Database Schema & Migration for Linked Folders

**Files:**
- Modify: `src/lib/db.ts:480-550`
- Modify: `src/types/index.ts`
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces:
  - `Subject.linked_folder_path?: string | null`
  - `Subject.folder_last_synced_at?: string | null`
  - `Subject.folder_sync_status?: 'idle' | 'syncing' | 'error'`
  - `Material.file_mtime?: number | null`
  - `Material.file_size?: number | null`
  - `Material.relative_path?: string | null`
  - `FolderSyncResult`: `{ success: boolean; addedCount: number; updatedCount: number; error?: string }`
  - `FolderSyncEvent`: `{ subjectId: number; added: string[]; updated: string[]; timestamp: string }`

- [ ] **Step 1: Write the failing test**

In `tests/unit/db.test.ts`, add test cases asserting the new schema columns and migrations:

```typescript
it('contains linked folder columns in subjects schema', () => {
  expect(DB_SCHEMA).toContain('linked_folder_path TEXT DEFAULT NULL')
  expect(DB_SCHEMA).toContain('folder_last_synced_at TEXT DEFAULT NULL')
  expect(DB_SCHEMA).toContain('folder_sync_status TEXT DEFAULT')
})

it('contains folder sync columns in materials schema', () => {
  expect(DB_SCHEMA).toContain('file_mtime INTEGER DEFAULT NULL')
  expect(DB_SCHEMA).toContain('file_size INTEGER DEFAULT NULL')
  expect(DB_SCHEMA).toContain('relative_path TEXT DEFAULT NULL')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/db.test.ts`
Expected: FAIL with missing schema strings.

- [ ] **Step 3: Update `src/lib/db.ts` and `src/types/index.ts`**

In `src/lib/db.ts`:
1. In `DB_SCHEMA`, add the columns to `subjects`:
   ```sql
   linked_folder_path TEXT DEFAULT NULL,
   folder_last_synced_at TEXT DEFAULT NULL,
   folder_sync_status TEXT DEFAULT 'idle' CHECK (folder_sync_status IN ('idle', 'syncing', 'error')),
   ```
2. In `DB_SCHEMA`, add the columns to `materials`:
   ```sql
   file_mtime INTEGER DEFAULT NULL,
   file_size INTEGER DEFAULT NULL,
   relative_path TEXT DEFAULT NULL,
   ```
3. In `MIGRATIONS_SQL`, add the alter table migrations for existing installations:
   ```typescript
   // V4.2: Linked class folders
   "ALTER TABLE subjects ADD COLUMN linked_folder_path TEXT DEFAULT NULL",
   "ALTER TABLE subjects ADD COLUMN folder_last_synced_at TEXT DEFAULT NULL",
   "ALTER TABLE subjects ADD COLUMN folder_sync_status TEXT DEFAULT 'idle'",
   "ALTER TABLE materials ADD COLUMN file_mtime INTEGER DEFAULT NULL",
   "ALTER TABLE materials ADD COLUMN file_size INTEGER DEFAULT NULL",
   "ALTER TABLE materials ADD COLUMN relative_path TEXT DEFAULT NULL",
   ```

In `src/types/index.ts`, update `Subject` and `Material` interfaces and export `FolderSyncResult` and `FolderSyncEvent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/types/index.ts tests/unit/db.test.ts
git commit -m "feat(db): add linked folder and sync columns to subjects and materials"
```

---

### Task 2: FolderSyncService Backend Engine

**Files:**
- Create: `electron/ipc/folderSyncService.ts`
- Test: `tests/unit/folderSyncService.test.ts`

**Interfaces:**
- Consumes: `parseFileToText` from `electron/ipc/documentParser.ts`, Database from `better-sqlite3`
- Produces:
  - `class FolderSyncService` with methods:
    - `static init(db: Database.Database, getWindow: () => BrowserWindow | null): Promise<void>`
    - `static scanAndSync(db: Database.Database, subjectId: number, folderPath: string): Promise<FolderSyncResult>`
    - `static startWatching(subjectId: number, folderPath: string): void`
    - `static stopWatching(subjectId: number): void`
    - `static stopAllWatchers(): void`
    - `static getStatus(subjectId: number): { isWatching: boolean; status: string }`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/folderSyncService.test.ts` testing:
1. `isSupportedFile(filename: string)` accepts `.pdf`, `.docx`, `.pptx`, `.txt`, `.md`, rejects `.DS_Store`, `~$test.docx`, `.png`.
2. `getRelativePath(baseDir: string, filePath: string)` returns normalized relative path.
3. Scanning a directory tree extracts files recursively.
4. Safe sync behavior: detecting added vs modified vs unchanged files without deleting records of missing files.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/folderSyncService.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `electron/ipc/folderSyncService.ts`**

Implement:
- Supported extensions: `['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md', '.markdown', '.rtf', '.html', '.csv']`.
- Directory walker using `fs.readdirSync(dir, { withFileTypes: true })` recursively up to max depth 8.
- Filter out files starting with `.` or `~$`.
- Change detection against SQLite:
  - Query existing materials for `subjectId`.
  - For new files: parse via `parseFileToText(fullPath)`, insert row into `materials`, record `relative_path`, `file_mtime`, `file_size`.
  - For modified files (mtime or size differs): re-parse, update `content_text`, `file_mtime`, `file_size`.
  - For existing files not found on disk: keep in database (Safe Sync).
- Debounced `fs.watch(folderPath, { recursive: true })` with 1500ms debounce map.
- Notification dispatching to `mainWindow.webContents.send('folder:sync-event', event)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/folderSyncService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/folderSyncService.ts tests/unit/folderSyncService.test.ts
git commit -m "feat(electron): implement FolderSyncService for file watching and sync"
```

---

### Task 3: IPC Handlers, Preload Bridge & App Lifecycle

**Files:**
- Create: `electron/ipc/folderHandlers.ts`
- Modify: `electron/main.ts:1-220`
- Modify: `electron/preload.ts:1-450`
- Modify: `tests/setup.ts`
- Test: `tests/unit/folderHandlers.test.ts`

**Interfaces:**
- Consumes: `FolderSyncService`
- Produces:
  - IPC handlers: `folder:selectDialog`, `folder:link`, `folder:unlink`, `folder:syncNow`, `folder:openFolder`
  - Window electronAPI methods: `selectFolderDialog`, `linkFolderToClass`, `unlinkFolderFromClass`, `syncClassFolder`, `openFolder`, `onFolderSync`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/folderHandlers.test.ts` testing IPC registration and handler functions (linking updates subject row, unlinking clears subject row).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/folderHandlers.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement IPC handlers and preload wiring**

1. Create `electron/ipc/folderHandlers.ts`:
   - `folder:selectDialog`: `dialog.showOpenDialog({ properties: ['openDirectory'] })`.
   - `folder:link`: updates `subjects.linked_folder_path`, calls `FolderSyncService.startWatching()`, runs `FolderSyncService.scanAndSync()`.
   - `folder:unlink`: calls `FolderSyncService.stopWatching()`, sets `linked_folder_path = NULL`.
   - `folder:syncNow`: calls `FolderSyncService.scanAndSync()`.
   - `folder:openFolder`: calls `shell.openPath(folderPath)`.
2. In `electron/main.ts`:
   - Register folder handlers: `registerFolderHandlers()`, `setFolderDatabase(db)`.
   - In `app.whenReady`: initialize `FolderSyncService.init(db, () => mainWindow)`.
   - In `app.on('before-quit')`: call `FolderSyncService.stopAllWatchers()`.
   - In `deleteSubjectCascade()`: ensure watcher is stopped when subject is deleted.
3. In `electron/preload.ts`:
   - Expose the folder APIs on `contextBridge.exposeInMainWorld('electronAPI', ...)`.
4. In `tests/setup.ts`:
   - Add default mock implementations for the new `electronAPI` methods.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/folderHandlers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/folderHandlers.ts electron/main.ts electron/preload.ts tests/setup.ts tests/unit/folderHandlers.test.ts
git commit -m "feat(ipc): register folder IPC handlers and expose via preload"
```

---

### Task 4: Class Materials Tab UI — Linked Folder Bar & Live Updates

**Files:**
- Modify: `src/pages/UnifiedSubjectDetail.tsx:810-910`
- Test: `tests/unit/UnifiedSubjectDetailFolder.test.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.selectFolderDialog`, `linkFolderToClass`, `unlinkFolderFromClass`, `syncClassFolder`, `openFolder`, `onFolderSync`

- [ ] **Step 1: Write the failing component test**

Create `tests/unit/UnifiedSubjectDetailFolder.test.tsx` verifying:
1. When `subject.linked_folder_path` is null, "Link Folder" button is rendered.
2. When `subject.linked_folder_path` is present, the Linked Folder Status Bar is rendered showing folder name, status, "Sync Now", and "Unlink" buttons.
3. Clicking "Sync Now" calls `syncClassFolder`.
4. Material items display `relative_path` badge if present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/UnifiedSubjectDetailFolder.test.tsx`
Expected: FAIL with missing elements.

- [ ] **Step 3: Update `UnifiedSubjectDetail.tsx`**

1. In the Materials Tab header:
   - If not linked: add "Link Folder" button with folder icon next to "Add Material".
   - If linked: render a clean status banner:
     - Folder icon + basename (with full path tooltip).
     - Active pulsing dot badge ("Watching").
     - Last synced time display.
     - "Sync Now" button with spinner state.
     - "Open in Finder" button.
     - "Unlink" button with confirmation.
2. In Material list item:
   - If `mat.relative_path` exists and differs from `mat.filename`, show a subtle relative path badge (e.g. `📁 Week 1 / Lecture 1.pdf`).
3. In `useEffect`:
   - Subscribe to `window.electronAPI.onFolderSync`:
     - When event matches `subjectId`: reload materials (`loadAllData()`), and show success toast: `✨ Added ${event.added.length} new files from linked folder`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/UnifiedSubjectDetailFolder.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/UnifiedSubjectDetail.tsx tests/unit/UnifiedSubjectDetailFolder.test.tsx
git commit -m "feat(ui): add linked folder bar and live sync to class materials tab"
```

---

### Task 5: Class Creation Wizard Integration

**Files:**
- Modify: `src/pages/classes/ClassCreationWizard.tsx:40-150`
- Test: `tests/unit/ClassCreationWizardFolder.test.tsx`

**Interfaces:**
- Consumes: `selectFolderDialog`, `parseFile`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ClassCreationWizardFolder.test.tsx` verifying that clicking "Link Class Folder" opens the directory dialog, scans documents, and lists them as pending materials.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/ClassCreationWizardFolder.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `ClassCreationWizard.tsx`**

1. Add state: `const [linkedFolderPath, setLinkedFolderPath] = useState<string | null>(null)`.
2. In Step 2 (Materials):
   - Add a button `"📁 Link Local Folder"`.
   - On click, call `window.electronAPI.selectFolderDialog()`.
   - If selected: scan/parse files in the folder and populate `pendingFiles` with folder documents.
   - Show linked folder banner in wizard.
3. In `handleCreateClass`:
   - Pass `linkedFolderPath` in class creation data so `subjects.linked_folder_path` is initialized on creation, and start watching immediately.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/ClassCreationWizardFolder.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/classes/ClassCreationWizard.tsx tests/unit/ClassCreationWizardFolder.test.tsx
git commit -m "feat(wizard): allow linking a folder during class creation"
```

---

### Task 6: Full Verification & Quality Assurance

**Files:**
- All modified files

- [ ] **Step 1: Run all unit and integration tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npm run typecheck`
Expected: Zero TypeScript errors.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: Clean linting output.

- [ ] **Step 4: Final commit & tag**

```bash
git commit --allow-empty -m "chore: verified linked class folder sync feature"
```
