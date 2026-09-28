# Execution prompt for GPT-6 Sol

Improve Neuron's complete tutor experience by executing `/Users/robmcarlson/Desktop/Neuron/docs/neuron-tutor-gpt6-sol-plan.md`. First read its companion `/Users/robmcarlson/Desktop/Neuron/docs/neuron-tutor-deep-audit.md` and the three supporting reports under `docs/audits/tutor-2026-09-26/`.

Begin with S00 and work through the dependency-ordered packages. The most urgent outcomes are: no learning credit without valid answer evidence; transactional, idempotent finalization; persistent session mode/target/runtime; isolated and cancellable streaming; and one reliable study-block/tutor lifecycle. Then improve source retrieval/citations, scaffolding and assessment, curriculum/retention semantics, planning, accessibility, summaries and cards.

The audit describes version 4.16.3 at HEAD `b7d6a0c` **plus an existing dirty working tree**. Inspect current source and changes; preserve all user work and completed improvements from `docs/neuron-luna-improvement-plan.md`. Do not blindly apply old findings if they have since been fixed. No production code was changed by the tutor audit.

Use the plan's contracts and tests as acceptance criteria. Retain the current stack and existing FSRS implementation. Make migrations additive and preserve history. Tests must use synthetic data, mocked providers and isolated Electron user-data directories. Do not touch the real study database, replace the installed application, publish a release or silently incur provider costs. GPT-6 Sol is the coding agent; do not change the application's AI provider merely to match that name.

Do not stop after revising prompts or styling. Complete each package with meaningful production-path verification and a short progress record. Implement in focused commits on a `codex/` branch, preserving pre-existing changes. Report actual tests and measurements, unresolved failures and remaining packages honestly. Evaluate educational behavior with the plan's reviewed rubric; do not claim improved real-world retention without delayed learner evidence.

Baseline audit results: typecheck and compile passed; focused Jest run passed 14 suites/66 tests. Renderer screenshots used mocked data. The full Electron walkthrough timed out before its first window, so native E2E is still a required verification step.
