# Lecture Audio Recording, Hybrid Transcription & Structured Notes Design Specification

## Overview
Neuron allows students to record audio of their lectures (including extended sessions of 120+ minutes) directly within a class. The recording streams safely to disk in real-time to prevent data loss. Upon completion, audio is transcribed using a hybrid engine (cloud APIs or one-click local Whisper) and synthesized into a structured Markdown study document optimized for Neuron's AI. The document is automatically registered in the class's Materials, ready for one-click flashcard generation, curriculum updates, and AI Tutor study sessions, while the original audio is preserved for playback.

---

## Key Requirements & User Decisions

1. **Crash-Resilient Long Recording (120+ Minutes):**
   - Audio is captured in the renderer via `MediaRecorder` (compressed Opus/WebM, ~250–350 KB/min, ~30–45 MB for 2 hours) and streamed in 15-second chunks to the Electron main process, writing directly to disk.
   - If the app restarts or the computer battery dies, all audio up to the last 15 seconds is preserved on disk with recovery options.

2. **Audio Retention:**
   - Audio files are stored permanently in the application's local data directory (`userData/recordings/`) and linked to the lecture database entry.
   - Students can play back the recording anytime with playback speed controls (1x, 1.25x, 1.5x, 2x).

3. **Microphone Device Selection:**
   - Students can choose their preferred microphone input device from a dropdown (e.g., built-in MacBook microphone vs. iPhone Continuity mic vs. Microsoft Teams audio vs. AirPods).
   - Selected device is remembered in app preferences, with live input level visualization prior to recording.

4. **Stealth / Discreet UI Indicator:**
   - Minimalist, low-profile indicator in the app header (a subtle, non-distracting dot with a compact timer: `• 1:14:02`).
   - Allows students to record discreetly in lecture halls without drawing unwanted attention.
   - Recording continues uninterrupted while students freely browse Flashcards, Tutor, or other classes.

5. **Dedicated "Lectures" Tab in Class:**
   - In `UnifiedSubjectDetail`, a new **Lectures** tab sits alongside *Curriculum*, *Cards*, *Materials*, and *Deadlines*.
   - Features a "Record Lecture" action, microphone selector, audio player, transcription progress badge, and quick actions to view notes, generate flashcards, or study with AI Tutor.

6. **Hybrid Transcription Engine:**
   - **Cloud STT**: Supports OpenAI Whisper API, Groq Whisper (ultra-fast), or Google Gemini Audio. Automatically splits audio into seamless ~20-minute chunks if exceeding API upload boundaries (e.g. OpenAI's 25MB limit).
   - **Local STT (One-Click Whisper)**: Runs completely on-device without any cloud connection or API keys. Integrated into Settings with a single "Download Local Whisper Model" button (~75–140 MB) and progress bar, mirroring Neuron's existing Local AI experience.

7. **Structured Note Generation (Optimized for Neuron AI):**
   - Transcripts are structured into rich Markdown by Neuron's active AI model (DeepSeek, Gemini, local LLM, etc.) with `# Topic` headings, core concepts, formulas, definitions, and study questions.
   - Full verbatim transcript is preserved in an expandable `<details>` section at the bottom.
   - Automatically saved as a class `Material`, instantly available for flashcard generation and RAG-based AI Tutor queries.

---

## Architecture & Subsystems

### 1. Data Model & SQLite Schema
Location: `src/lib/db.ts`

#### New `lectures` Table
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

#### Settings / App Meta Keys
- `audio_input_device_id`: Preferred audio input device ID.
- `transcription_provider`: `'groq' | 'openai' | 'gemini' | 'local'`.
- `transcription_api_key_groq_encrypted`: Encrypted Groq key (if using Groq Whisper).
- `local_whisper_model_path`: Path to downloaded local Whisper model file.
- `local_whisper_status`: `'not_installed' | 'downloading' | 'ready'`.

---

### 2. Electron Main Process Services

#### A. Lecture Audio Service (`electron/ipc/lectureAudioService.ts`)
- Manages active recording file streams.
- Allocates unique filenames: `userData/recordings/lecture_<subjectId>_<timestamp>.webm`.
- `appendChunk(sessionId, buffer)`: Appends incoming binary audio chunks to the file via an active `fs.WriteStream`.
- `finalizeRecording(sessionId, durationSeconds)`: Closes file stream, verifies integrity and file size, updates `lectures` status to `'recorded'`.
- `abortRecording(sessionId)`: Cleans up file stream and removes partial file if discarded by user.

#### B. Hybrid Transcription Service (`electron/ipc/transcriptionService.ts`)
- Dispatches transcription based on user configuration:
  - **Groq Whisper (`whisper-large-v3-turbo`)**: Ultra-low latency, free tier available.
  - **OpenAI Whisper (`whisper-1`)**: Standard cloud Whisper. For files >25MB, automatically splits audio chunks using lightweight ffmpeg/audio chunking.
  - **Gemini Audio**: Uploads audio to Gemini File API for transcription.
  - **Local Whisper**: Runs on-device via quantized Whisper (using `whisper.cpp` binary or node runtime) with zero cloud network traffic.

#### C. Note Synthesis Service (`electron/ipc/lectureNotesService.ts`)
- Takes timestamped raw transcript text.
- Calls Neuron's active AI LLM with `buildLectureNotesPrompt()`:
  - Generates executive summary, learning objectives, definitions, formulas, chronological timestamped notes, and review questions.
  - Formats output as GitHub Flavored Markdown.
- Automatically inserts the document into `materials` table (`Lecture - [Title].md`).
- Links `material_id` to the `lectures` record and sets status to `'ready'`.

---

### 3. IPC Handlers & Preload API

#### IPC Handlers (`electron/ipc/lectureHandlers.ts`)
- `lecture:startRecording(subjectId, title)` → `{ sessionId, lectureId }`
- `lecture:writeChunk(sessionId, buffer)` → `{ success: boolean }`
- `lecture:stopRecording(sessionId, durationSeconds)` → `{ lectureId }`
- `lecture:abortRecording(sessionId)` → `{ success: boolean }`
- `lecture:list(subjectId)` → `Lecture[]`
- `lecture:get(lectureId)` → `Lecture`
- `lecture:delete(lectureId, deleteAudioFile: boolean)` → `{ success: boolean }`
- `lecture:retryTranscription(lectureId)` → `{ success: boolean }`
- `lecture:downloadLocalWhisper()` → initiates local model download with progress events.
- `lecture:testTranscription()` → runs quick test.

#### Preload API (`electron/preload.ts`)
```ts
window.electronAPI.startLectureRecording(subjectId: number, title?: string): Promise<{ sessionId: string; lectureId: number }>
window.electronAPI.sendLectureAudioChunk(sessionId: string, chunk: ArrayBuffer): Promise<boolean>
window.electronAPI.stopLectureRecording(sessionId: string, durationSeconds: number): Promise<{ lectureId: number }>
window.electronAPI.abortLectureRecording(sessionId: string): Promise<boolean>
window.electronAPI.listLectures(subjectId: number): Promise<Lecture[]>
window.electronAPI.deleteLecture(lectureId: number, deleteAudio: boolean): Promise<boolean>
window.electronAPI.retryLectureTranscription(lectureId: number): Promise<boolean>
window.electronAPI.getAudioFileUrl(audioPath: string): Promise<string>
window.electronAPI.onTranscriptionProgress(callback: (status: { lectureId: number; status: string; progress?: number }) => void): () => void
```

---

### 4. Renderer State & UI Components

#### A. Global Recording Store (`src/store/lectureRecordingStore.ts`)
- State:
  - `isRecording`: boolean
  - `isPaused`: boolean
  - `sessionId`: string | null
  - `activeLectureId`: number | null
  - `subjectId`: number | null
  - `subjectName`: string
  - `elapsedSeconds`: number
  - `selectedAudioDeviceId`: string
- Methods: `start(subjectId, subjectName, title)`, `pause()`, `resume()`, `stop()`, `cancel()`.
- Uses `MediaRecorder` with `timeslice = 15000` (15-second chunk callbacks).

#### B. Stealth Minimal Recording Indicator
- Placed in the top navigation bar or sidebar status area.
- Unobtrusive appearance: a subtle soft dot with compact elapsed time (e.g. `• 42:15`).
- On click: A small dropdown popover showing:
  - Recording title and class name
  - Subtle waveform/audio meter confirming mic activity
  - Minimal **Pause / Resume** and **Finish Recording** buttons.

#### C. Dedicated Lectures Tab (`src/pages/UnifiedSubjectDetail.tsx`)
- Tab item: `Lectures` added to the navigation bar.
- **Top Action Bar**:
  - "Record Lecture" primary button.
  - Microphone selector dropdown showing all detected devices (labels: "MacBook Pro Microphone", "iPhone Microphone", "Headphones", etc.).
- **Lecture List**:
  - Card per lecture with title, date, duration, and status badge (`Recording`, `Transcribing...`, `Ready`, `Failed`).
  - **Embedded Audio Player**:
    - Scrub bar, play/pause, time display (`current / total`).
    - Speed selector (`1x`, `1.25x`, `1.5x`, `2x`).
  - **Action buttons**:
    - 📝 **View Notes**: Opens preview modal with full Markdown formatting and copy/export options.
    - ✨ **Generate Cards**: Launches `CardImportModal` / `GenerateCardsModal` pre-filled with this lecture.
    - 🎓 **Study with Tutor**: Launches AI Tutor pre-scoped to this lecture's topics.
    - 🗑️ **Delete**: With checkbox "Also delete audio file from disk".

#### D. Settings Integration (`src/pages/Settings.tsx`)
- **Transcription & Audio Section**:
  - Audio Input Selector: Default microphone selection with test audio meter.
  - Cloud Providers: Direct links and API key inputs for Groq, OpenAI, and Google Gemini with a "Test Connection" button.
  - One-Click Local Whisper: "Download Local Whisper Model" with hardware detection (Apple Silicon Metal acceleration) and live download progress.

---

## Edge Case Handling & Fault Tolerance

1. **System Sleep / App Termination During Recording:**
   - Incomplete recording sessions on disk have valid WebM headers for flushed chunks.
   - Upon next app launch, Neuron detects any lecture in status `'recording'` with an existing audio file on disk, updates status to `'recorded'`, and offers a one-click "Process & Transcribe" button.
2. **Microphone Permissions Denied:**
   - Renderer checks `navigator.permissions.query({ name: 'microphone' })` and prompts user with clear instructions for macOS *System Settings > Privacy & Security > Microphone*.
3. **Transcription API Failure / Rate Limit:**
   - Status transitions to `'failed'` with specific error message.
   - Audio file remains untouched on disk.
   - User can click "Retry Transcription" or switch from Cloud to Local (or different API key) and re-run without losing audio.
4. **Large File Upload Chunking:**
   - Files exceeding 25MB are automatically sliced into standard-sized audio parts, transcribed concurrently, and assembled by chronological timestamps.

---

## Verification & Testing Plan

1. **Audio Recording & Streaming:**
   - Verify microphone permissions request and device enumeration.
   - Verify 15-second audio chunks stream to disk and verify resulting `.webm` plays cleanly.
   - Test navigation during active recording (recording persists across route changes).
2. **Transcription Pipeline:**
   - Test cloud transcription (Groq / OpenAI / Gemini).
   - Test local Whisper model download and local transcription flow.
   - Test retry mechanism on network interruption.
3. **Note Synthesis & Materials Integration:**
   - Verify generated markdown contains structured headings, concepts, timestamps, and collapsible transcript.
   - Verify note appears in `materials` table and triggers the curriculum update prompt.
   - Verify one-click flashcard generation from the recorded lecture.
