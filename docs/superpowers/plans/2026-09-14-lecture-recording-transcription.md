# Lecture Audio Recording & Hybrid Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable students to record 120+ minute lectures directly in Neuron, stream audio safely to disk in 15-second chunks, transcribe via a hybrid engine (cloud APIs or one-click local Whisper), generate structured Markdown notes optimized for Neuron's AI, and auto-register them in class Materials for flashcards and AI tutoring.

**Architecture:** 
- Real-time disk-streaming in Electron using `MediaRecorder` in renderer transmitting 15-second compressed WebM chunks to `lectureAudioService.ts` via IPC to prevent data loss.
- Hybrid transcription adapter in `transcriptionService.ts` supporting cloud providers (Groq Whisper, OpenAI Whisper, Gemini Audio) with automatic 25MB chunking, plus one-click local Whisper via `localWhisperService.ts`.
- Structured note generation via `buildLectureNotesPrompt()` in `promptBuilders.ts` and `lectureNotesService.ts`, saving notes as class `Material` and linking to audio.
- Stealth minimal recording indicator in `Layout.tsx` and dedicated `Lectures` tab in `UnifiedSubjectDetail.tsx` with audio playback and quick study actions.

**Tech Stack:** Electron 41, Node.js fs streams, SQLite (better-sqlite3), React 18, TypeScript, Tailwind CSS, Web Audio API / MediaRecorder, Zustand.

**Spec:** `docs/superpowers/specs/2026-09-14-lecture-recording-transcription-design.md`

## Global Constraints
- Long audio support up to 120+ minutes with crash-resilient 15s disk chunking.
- Audio file retention on disk in `userData/recordings/` with in-app playback.
- Discreet "stealth" minimal recording indicator (no loud flashing banners).
- Microphone input device selection with preference persistence.
- Hybrid transcription (Cloud STT with direct setup links + One-Click Local Whisper).
- Structured Markdown note output registered as class `Material`.

---

### Task 1: Database Migration & TypeScript Interfaces

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/db.ts`
- Test: `tests/lecturesDb.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LectureStatus = 'recording' | 'recorded' | 'transcribing' | 'ready' | 'failed'

  export interface Lecture {
    id: number
    subject_id: number
    title: string
    audio_path: string
    audio_mime_type: string
    duration_seconds: number
    file_size_bytes: number
    status: LectureStatus
    raw_transcript?: string | null
    error_message?: string | null
    material_id?: number | null
    created_at: string
    updated_at: string
  }
  ```

- [ ] **Step 1: Write the failing database test**
Create `tests/lecturesDb.test.ts`:
```ts
import Database from 'better-sqlite3'
import { initDatabase, createLecture, getLectureById, listLecturesBySubject, updateLectureStatus, deleteLecture } from '../src/lib/db'

describe('Lectures DB operations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  test('creates and retrieves a lecture', () => {
    const lecture = createLecture(db, {
      subject_id: 1,
      title: 'Biology 101 Lecture 1',
      audio_path: '/tmp/test.webm',
      audio_mime_type: 'audio/webm',
      duration_seconds: 3600,
      file_size_bytes: 15000000,
      status: 'recording'
    })

    expect(lecture.id).toBeDefined()
    expect(lecture.title).toBe('Biology 101 Lecture 1')

    const fetched = getLectureById(db, lecture.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.status).toBe('recording')

    updateLectureStatus(db, lecture.id, 'ready', { raw_transcript: 'Hello world' })
    const updated = getLectureById(db, lecture.id)
    expect(updated?.status).toBe('ready')
    expect(updated?.raw_transcript).toBe('Hello world')

    const list = listLecturesBySubject(db, 1)
    expect(list.length).toBe(1)

    deleteLecture(db, lecture.id)
    expect(getLectureById(db, lecture.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/lecturesDb.test.ts`
Expected: FAIL with missing functions / schema.

- [ ] **Step 3: Update `src/types/index.ts` and `src/lib/db.ts`**
Add the `lectures` table migration in `initDatabase` in `src/lib/db.ts`:
```sql
CREATE TABLE IF NOT EXISTS lectures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  audio_mime_type TEXT DEFAULT 'audio/webm',
  duration_seconds INTEGER DEFAULT 0,
  file_size_bytes INTEGER DEFAULT 0,
  status TEXT CHECK(status IN ('recording', 'recorded', 'transcribing', 'ready', 'failed')) DEFAULT 'recording',
  raw_transcript TEXT,
  error_message TEXT,
  material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
Add CRUD helper functions: `createLecture`, `getLectureById`, `listLecturesBySubject`, `updateLectureStatus`, `deleteLecture`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/lecturesDb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/types/index.ts src/lib/db.ts tests/lecturesDb.test.ts
git commit -m "feat(db): add lectures table schema, types, and crud operations"
```

---

### Task 2: Electron Audio Streaming & Recording Manager

**Files:**
- Create: `electron/ipc/lectureAudioService.ts`
- Create: `electron/ipc/lectureHandlers.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Test: `tests/lectureAudioService.test.ts`

**Interfaces:**
- Consumes: `createLecture`, `getLectureById`, `updateLectureStatus` from `src/lib/db.ts`
- Produces:
  - `startRecording(subjectId: number, title?: string): { sessionId: string; lectureId: number; audioPath: string }`
  - `appendChunk(sessionId: string, chunk: Buffer): void`
  - `finalizeRecording(sessionId: string, durationSeconds: number): Promise<{ lectureId: number; audioPath: string; fileSizeBytes: number }>`
  - `abortRecording(sessionId: string): Promise<void>`

- [ ] **Step 1: Write the failing unit test for `lectureAudioService`**
Create `tests/lectureAudioService.test.ts` verifying session creation, chunk appending, and finalizing to a valid audio file on disk.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/lectureAudioService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lectureAudioService.ts` & `lectureHandlers.ts`**
- Manages an active session map `Map<string, { writeStream: fs.WriteStream, lectureId: number, filePath: string, bytes: number }>`.
- Writes chunks to `app.getPath('userData')/recordings/`.
- Registers IPC handlers:
  - `lecture:startRecording`
  - `lecture:writeChunk`
  - `lecture:stopRecording`
  - `lecture:abortRecording`
  - `lecture:list`
  - `lecture:delete`
  - `lecture:getAudioUrl` (via `atom://` or custom file protocol safe URL)
- Expose methods in `electron/preload.ts`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/lectureAudioService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add electron/ipc/lectureAudioService.ts electron/ipc/lectureHandlers.ts electron/main.ts electron/preload.ts tests/lectureAudioService.test.ts
git commit -m "feat(electron): add lecture audio disk streaming service and ipc handlers"
```

---

### Task 3: Hybrid Transcription Service (Cloud + Chunking + Local Whisper)

**Files:**
- Create: `electron/ipc/transcriptionService.ts`
- Create: `electron/ipc/localWhisperService.ts`
- Test: `tests/transcriptionService.test.ts`

**Interfaces:**
- Consumes: audio file path on disk
- Produces:
  `transcribeAudio(audioPath: string, options?: { provider?: string; language?: string }): Promise<{ transcript: string; durationSeconds: number }>`

- [ ] **Step 1: Write failing unit test for transcription dispatcher and 25MB chunk splitter**
Create `tests/transcriptionService.test.ts` to test:
- Dispatch to Groq Whisper (`https://api.groq.com/openai/v1/audio/transcriptions`)
- Dispatch to OpenAI Whisper (`https://api.openai.com/v1/audio/transcriptions`)
- Splitting large audio streams when over 25MB
- Formatting timestamped transcript text

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/transcriptionService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `transcriptionService.ts` and `localWhisperService.ts`**
- In `transcriptionService.ts`:
  - Read configured transcription provider from `app_meta` or options.
  - For files >25MB with OpenAI, slice into safe chunks and stitch transcripts chronologically.
  - Add Groq Whisper support (super fast, high accuracy, low cost/free tier).
  - Add Gemini Audio transcription fallback.
- In `localWhisperService.ts`:
  - Provide model download helper for ggml/whisper quantized model with progress events.
  - Execute local transcription.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/transcriptionService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add electron/ipc/transcriptionService.ts electron/ipc/localWhisperService.ts tests/transcriptionService.test.ts
git commit -m "feat(transcription): implement hybrid transcription service with cloud chunking and local whisper"
```

---

### Task 4: Note Synthesis Service & Class Material Registration

**Files:**
- Modify: `src/lib/promptBuilders.ts`
- Create: `electron/ipc/lectureNotesService.ts`
- Test: `tests/lectureNotesService.test.ts`

**Interfaces:**
- Consumes: `raw_transcript`, `className`, `lectureTitle`, `db`
- Produces:
  `synthesizeLectureNotes(lectureId: number): Promise<{ materialId: number; markdownContent: string }>`

- [ ] **Step 1: Write failing test for `buildLectureNotesPrompt` and `synthesizeLectureNotes`**
Create `tests/lectureNotesService.test.ts` verifying prompt creation and material insertion into SQLite.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/lectureNotesService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `buildLectureNotesPrompt` and `lectureNotesService.ts`**
- Add `buildLectureNotesPrompt(rawTranscript: string, subjectName: string, lectureTitle: string): string` in `src/lib/promptBuilders.ts`.
- In `electron/ipc/lectureNotesService.ts`:
  - Call AI (using active AI config).
  - Clean markdown output.
  - Insert into `materials` table: `filename: 'Lecture - ' + title + '.md'`, `file_type: 'md'`, `content_text: markdownContent`.
  - Update `lectures` row: `material_id = materialId`, `status = 'ready'`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/lectureNotesService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/promptBuilders.ts electron/ipc/lectureNotesService.ts tests/lectureNotesService.test.ts
git commit -m "feat(synthesis): add lecture notes prompt builder and materials auto-registration"
```

---

### Task 5: Frontend Recording Store & Microphone Device Selector

**Files:**
- Create: `src/store/lectureRecordingStore.ts`
- Create: `src/components/classes/AudioDeviceSelector.tsx`
- Test: `tests/lectureRecordingStore.test.ts`

**Interfaces:**
- Produces:
  `useLectureRecordingStore`: `isRecording`, `isPaused`, `elapsedSeconds`, `selectedDeviceId`, `startRecording`, `pauseRecording`, `resumeRecording`, `stopRecording`, `cancelRecording`

- [ ] **Step 1: Write unit test for `lectureRecordingStore`**
Test state transitions, timer increments, and mock `MediaRecorder` chunk forwarding.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/lectureRecordingStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lectureRecordingStore.ts` and `AudioDeviceSelector.tsx`**
- `AudioDeviceSelector.tsx`:
  - Enumerate `audioinput` devices using `navigator.mediaDevices.enumerateDevices()`.
  - Display friendly names ("MacBook Pro Microphone", "iPhone Microphone", "AirPods", etc.).
  - Store selected `deviceId` in `localStorage` or store.
  - Include live visual audio level indicator (via `AudioContext` + `AnalyserNode`) so user can see mic working before recording.
- `lectureRecordingStore.ts`:
  - Acquire stream with `deviceId: { exact: selectedDeviceId }`.
  - Initialize `MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })`.
  - Every 15 seconds `ondataavailable` sends chunk buffer to `window.electronAPI.sendLectureAudioChunk`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/lectureRecordingStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/store/lectureRecordingStore.ts src/components/classes/AudioDeviceSelector.tsx tests/lectureRecordingStore.test.ts
git commit -m "feat(ui): add lecture recording zustand store and audio device selector"
```

---

### Task 6: Stealth Minimal Recording Indicator in App Header

**Files:**
- Create: `src/components/classes/StealthRecordingIndicator.tsx`
- Modify: `src/components/Layout.tsx`

**Interfaces:**
- Consumes: `useLectureRecordingStore`

- [ ] **Step 1: Implement `StealthRecordingIndicator.tsx`**
- Displays a small subtle dot + timer: e.g. `• 42:15` when recording is active.
- Minimalist design that doesn't draw unwanted attention in class.
- Clicking expands a clean, discreet popover:
  - Lecture title & class name.
  - Mini audio level bar.
  - Buttons: Pause / Resume, Stop & Process, Cancel.
- Hidden when not recording.

- [ ] **Step 2: Mount into `src/components/Layout.tsx`**
- Positioned in the header/top navigation so it remains visible and accessible regardless of which page the user navigates to.

- [ ] **Step 3: Verify manually & run lint / typecheck**
Run: `npm run typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**
```bash
git add src/components/classes/StealthRecordingIndicator.tsx src/components/Layout.tsx
git commit -m "feat(ui): add stealth minimal recording indicator to app header"
```

---

### Task 7: Dedicated "Lectures" Tab in `UnifiedSubjectDetail`

**Files:**
- Create: `src/components/classes/LectureAudioPlayer.tsx`
- Create: `src/components/classes/LectureNotesModal.tsx`
- Modify: `src/pages/UnifiedSubjectDetail.tsx`

**Interfaces:**
- Adds `'lectures'` to `type Tab = 'cards' | 'curriculum' | 'materials' | 'lectures' | 'deadlines'`.

- [ ] **Step 1: Implement `LectureAudioPlayer.tsx` & `LectureNotesModal.tsx`**
- `LectureAudioPlayer`: Custom clean audio player with play/pause, seek slider, current/total time, and playback speed pills (`1x`, `1.25x`, `1.5x`, `2x`).
- `LectureNotesModal`: Modal displaying the synthesized markdown lecture notes with copy button, export markdown button, and direct "Generate Flashcards" button.

- [ ] **Step 2: Add "Lectures" Tab to `UnifiedSubjectDetail.tsx`**
- Navigation bar includes `[ Lectures ]` tab.
- Tab content:
  - Header: "Record Lecture" button + Microphone selector (`AudioDeviceSelector`).
  - List of past recorded lectures:
    - Title, recorded date, duration, status badge (`Recording`, `Transcribing...`, `Ready`, `Failed`).
    - Embedded audio player for completed recordings.
    - Quick actions:
      - 📝 **View Notes**: Opens `LectureNotesModal`.
      - ✨ **Generate Cards**: Opens `CardImportModal` with lecture text.
      - 🎓 **Study with Tutor**: Opens AI Tutor pre-scoped to this lecture.
      - 🔄 **Retry**: If transcription failed.
      - 🗑️ **Delete**: With confirmation dialog.

- [ ] **Step 3: Run typecheck and tests**
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/components/classes/LectureAudioPlayer.tsx src/components/classes/LectureNotesModal.tsx src/pages/UnifiedSubjectDetail.tsx
git commit -m "feat(ui): add dedicated lectures tab with audio player and study actions to unified subject detail"
```

---

### Task 8: Settings Integration (Transcription Keys & One-Click Local Whisper)

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `electron/ipc/aiConfigStore.ts`

- [ ] **Step 1: Add Lecture Transcription section in `Settings.tsx`**
- Cloud Provider Settings:
  - Radio options: Groq (Recommended - Fast & Free), OpenAI Whisper, Gemini Audio, Local Whisper.
  - Setup guide cards with direct 1-click links:
    - *Get free Groq API key* (`https://console.groq.com/keys`)
    - *Get OpenAI API key* (`https://platform.openai.com/api-keys`)
    - *Get Google AI Studio key* (`https://aistudio.google.com/app/apikey`)
  - "Test Transcription" button to verify configuration.
- One-Click Local Whisper Card:
  - Displays hardware profile (Apple Silicon / Metal acceleration detected).
  - Single button: "Download Local Whisper Model" (~75-140MB).
  - Progress bar showing download percentage.
  - Automatically activates local transcription when downloaded.
- Microphone Preference:
  - Default input device selector with live volume meter.

- [ ] **Step 2: Run typecheck and tests**
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add src/pages/Settings.tsx electron/ipc/aiConfigStore.ts
git commit -m "feat(settings): add transcription setup guides and one-click local whisper download"
```

---

### Task 9: End-to-End Verification & Integration Check

**Files:**
- Test: `tests/lecturesIntegration.test.ts`

- [ ] **Step 1: Write integration test covering full recording -> transcribing -> material generation pipeline**
- [ ] **Step 2: Run all test suites**
Run: `npm test`
Expected: All tests pass.
- [ ] **Step 3: Run typecheck and linter**
Run: `npm run typecheck && npm run lint`
Expected: 0 errors.
- [ ] **Step 4: Commit**
```bash
git add tests/lecturesIntegration.test.ts
git commit -m "test: add integration test for lecture recording, transcription, and material generation"
```
