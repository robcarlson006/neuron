# Neuron

An AI-powered spaced repetition desktop application for smarter studying. Neuron uses the DeepSeek API (via an OpenAI-compatible provider layer) to automatically generate flashcards and active recall questions from your study materials, then schedules reviews using the FSRS-5 spaced repetition algorithm.

## Features

- **AI Card Generation**: Upload PDF, DOCX, or PPTX files and the AI automatically creates flashcards and active recall questions
- **Spaced Repetition (FSRS-5)**: Intelligent scheduling — cards you struggle with appear more often, mastered cards are spaced further apart
- **Active Recall with AI Grading**: Type open-ended answers and the AI evaluates them with detailed feedback
- **Flashcard Mode**: Classic flip-card interface with confidence rating
- **Diagnostics Test**: Run a rapid assessment to identify strong, moderate, and weak areas
- **Calendar View**: See scheduled reviews and exam deadlines at a glance
- **Analytics Dashboard**: Track mastery %, review history, streaks, and weakest cards
- **Ongoing/Maintenance Mode**: Long-term retention mode for completed subjects
- **Dark/Light Mode**: System-friendly theme toggle
- **Local Data**: All study data stored in SQLite — no account required
- **Seed Data**: Ships with 25+ World History cards for immediate exploration

## 📥 Download Neuron

You can download the latest pre-built installers for macOS, Windows, and Linux directly from [GitHub Releases](https://github.com/robcarlson006/neuron/releases/latest):

| Platform | Architecture | Download |
| :--- | :--- | :--- |
| 🍏 **macOS** | **Apple Silicon (M1 / M2 / M3 / M4)** | [**Neuron-3.1.0-arm64.dmg**](https://github.com/robcarlson006/neuron/releases/download/v3.1.0/Neuron-3.1.0-arm64.dmg) |
| 🍏 **macOS** | **Intel (x64)** | [**Neuron-3.1.0.dmg**](https://github.com/robcarlson006/neuron/releases/download/v3.1.0/Neuron-3.1.0.dmg) |
| 🪟 **Windows** | **64-bit** | [**Neuron.Setup.3.1.0.exe**](https://github.com/robcarlson006/neuron/releases/download/v3.1.0/Neuron.Setup.3.1.0.exe) |
| 🐧 **Linux** | **x64** | [**Neuron-3.1.0.AppImage**](https://github.com/robcarlson006/neuron/releases/download/v3.1.0/Neuron-3.1.0.AppImage) |

---

### 🍎 macOS Installation Note (Gatekeeper / "Damaged" message)

Because Neuron is open-source and not yet signed with a paid Apple Developer certificate, macOS Gatekeeper may show a message like *"Neuron is damaged and can't be opened"* or *"Apple cannot check it for malicious software"*.

**To open Neuron on macOS:**
1. Open the downloaded `.dmg` and drag **Neuron** to your `/Applications` folder.
2. Open **Terminal** and run this single command to remove the quarantine flag:
   ```bash
   xattr -cr /Applications/Neuron.app
   ```
3. Launch **Neuron** from Applications or Spotlight!

*(Alternatively: Right-click `Neuron.app` in `/Applications` → click **Open** → click **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**).*

---

### 🪟 Windows Installation Note

If Microsoft Defender SmartScreen displays *"Windows protected your PC"*:
1. Click **More info**.
2. Click **Run anyway**.

---

## 🛠️ Development & Building from Source

### Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org)
- **npm 9+** (included with Node.js)

### Setup

```bash
# Clone the repository
git clone https://github.com/robcarlson006/neuron.git
cd neuron

# Install dependencies
npm install

# Run the app in development mode
npm run dev
```

This starts Electron with hot-reload for the renderer process.

### Build for production

```bash
npm run build
```

This runs `electron-vite build` then `electron-builder` to produce a distributable installer in the `dist/` directory.

### Run unit & component tests

```bash
npm test
```

Tests cover:
- SM-2 and FSRS-5 scheduling algorithms (all branches, edge cases)
- AI response parsing (valid JSON, malformed, empty)
- Database schema verification
- FlashCard component (flip interaction, confidence buttons)
- ActiveRecallCard component (answer submission, feedback display)
- Dashboard component (card counts, subject display)

### Run E2E tests

First build the app, then run:

```bash
npm run test:e2e
```

E2E tests use Playwright and simulate:
- Completing onboarding
- Creating a subject
- Verifying dashboard renders

### Lint

```bash
npm run lint
```

## Database Location

Neuron stores your study data in a local SQLite database:

| OS      | Path |
|---------|------|
| macOS   | `~/Library/Application Support/studyhelper/studyhelper.db` |
| Linux   | `~/.config/studyhelper/studyhelper.db` |
| Windows | `%APPDATA%\studyhelper\studyhelper.db` |

## How It Works

### Spaced Repetition (SM-2 / FSRS-5)

After each card review, you rate your confidence:
- **Got it perfectly** → quality 5
- **Got it with hesitation** → quality 4
- **Almost** → quality 3
- **Forgot / got it wrong** → quality 1

The spaced repetition algorithm adjusts the next review interval based on your rating. Cards you know well are scheduled further out (weeks/months); cards you struggle with come back sooner.

**Mastery threshold**: A card is considered "mastered" when its interval reaches 21+ days.

### Ongoing Subjects

Mark a subject as "Ongoing" for long-term retention. When a card's interval reaches 30+ days and its ease factor is ≥ 2.5, it enters maintenance mode — reviewed every 30–90 days to prevent forgetting without excessive repetition.

### Exam Boost

Add exam deadlines to a subject. If an exam is within 7 days, the scheduler caps review intervals to ensure you see each card before the exam.

## Project Structure

```
neuron/
├── electron/           # Main process (Node.js/Electron)
│   ├── main.ts         # App entry, window creation, DB init
│   ├── preload.ts      # contextBridge API exposure
│   └── ipc/
│       ├── dbHandlers.ts      # SQLite operations
│       ├── fileHandlers.ts    # PDF/DOCX/PPTX parsing
│       └── geminiHandlers.ts  # Gemini AI integration
├── src/                # Renderer process (React/TypeScript)
│   ├── components/     # Reusable UI components
│   ├── pages/          # Page-level components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Core logic (SM-2, Gemini, DB schema)
│   ├── store/          # Zustand global state
│   └── types/          # TypeScript type definitions
├── tests/
│   ├── unit/           # Logic unit tests (Jest)
│   ├── components/     # React component tests
│   └── e2e/            # End-to-end tests (Playwright)
└── seed/               # World History seed data
```

## Troubleshooting

### "Failed to process file"
- Ensure the file is not password-protected
- PDF must be text-based (not a scanned image)
- Try a different file format

### App won't start
- Ensure Node.js 18+ is installed: `node --version`
- Delete `node_modules` and re-run `npm install`
- Check for port conflicts if the dev server fails

### Cards not appearing
- Ensure you've uploaded a material file to the subject
- Check the subject's card count in the Subject Detail view
- Run Diagnostics to seed your SM-2 schedule

### SQLite errors
The database is created automatically on first launch. If you get SQLite errors, try deleting the `.db` file at the path above and restarting the app.

## Tech Stack

- **Electron 41** with contextBridge/preload security model
- **React 18** + **TypeScript 5**
- **Tailwind CSS 3** (light/dark mode)
- **SQLite** via `better-sqlite3`
- **DeepSeek** via the OpenAI-compatible chat completions API
- **Zustand** for state management
- **Recharts** for analytics charts
- **Vite** + **electron-vite** for building
- **Jest** + **@testing-library/react** for testing
- **Playwright** for E2E tests
