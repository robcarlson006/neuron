# AI Curriculum Generation Deep Dive

**Date:** 2026-10-05  
**Scope:** Neuron's AI-generated curriculum/syllabus pipeline, from uploaded source material through generation, reconciliation, persistence, and learner use. No application code was changed.

## Executive summary

Neuron already has a sound foundation: curriculum generation is grounded in user-uploaded materials, large documents are structurally summarized rather than naively truncated, and reconciliation preserves completed topics, cards, and practice work. The system is materially stronger than a one-shot “make me a study plan” prompt.

The main limitation is that the generated artifact is a topic outline, not a verifiable learning design. The model is asked for module titles, descriptions, prerequisites, topic types, time estimates, and material IDs. The application checks that a `modules` array exists, but it does not verify that every topic is grounded in the claimed source, that prerequisites form a valid progression, that estimates fit the learner’s available time, or that each topic has a measurable outcome and a way to demonstrate mastery. JSON mode protects parseability, not educational or factual quality. This makes a plausible-looking curriculum possible even when its ordering, coverage, and learning activities are weak.

The highest-return improvement is a staged, reviewable compiler: extract a source-grounded concept inventory; construct and validate an outcome/prerequisite graph; derive modules and a schedule; then add retrieval, practice, and mastery checks. Preserve the current reconciliation and manual editing model, but do not persist a generation that fails deterministic checks. Couple this with a fixed evaluation set and sampled human review so quality can be measured rather than inferred from anecdote.

Two urgent defects should be fixed before that larger redesign. First, `{ "modules": [] }` passes the current guard, after which reconciliation can delete unmatched uncompleted topics and mark all materials processed. Second, regeneration returns a reconciliation object while renderer callers and preload types expect an array; the database can change but the UI fails its `result.length` check and does not reload or confirm success. The configured default DeepSeek route also appears to rewrite `deepseek-flash` to a model documented in the repository as retired, risking a 120-second timeout.

## Introduction

The review covers source preparation, model prompting, output parsing, reconciliation, persistence, UI contracts, and tests. It treats learning design, reliability, and auditability as separate requirements: a plan must be pedagogically useful, safe to apply, and possible to inspect after the fact.

## Main Analysis

### How the current system works

The main path is `syllabus:generateFromMaterials` in `electron/ipc/syllabusHandlers.ts`. It loads a subject’s material text, converts each document through `buildComprehensiveOutline`, prompts the configured provider for a JSON object, parses the response with repair support, and sends the modules to `reconcileCurriculum`. The reconciler matches prior topics by model-supplied title, a title-token fingerprint, exact normalization, then substring similarity. It retains completed or referenced unmatched topics, deletes other unmatched topics, and marks all materials as processed.

The prompt has sensible safeguards: foundation-first ordering, two-to-five topics per module, source-material IDs, concept types, estimated active-retrieval minutes, and explicit distinction between a prior topic and a genuinely new topic. The reconciler is transactional and protects progress. A new Manual syllabus is deliberately separate, giving learners a non-AI fallback.

There is also a second, older generation implementation in `electron/ipc/classHandlers.ts`, invoked during class creation. It has a weaker schema and replaces all modules and topics. It does not use reconciliation metadata or preserve the richer source, type, and estimate fields. Two implementations will drift as prompts, models, and correctness checks evolve.

### 1. Long-document grounding is broad but shallow

For documents longer than 16,000 characters, the topology helper emits section titles, at most two lines/100–160 characters per section, plus the first and last 1,500 characters. This avoids total coverage loss, but the model has insufficient evidence for nuanced ordering, definitions, exceptions, and relationships inside most sections. The system asks for `source_material_ids`, but those IDs only identify a whole document; no page, section, quote, or character-span evidence is required or verified. A curriculum can therefore claim grounding without offering inspectable provenance.

**Recommendation:** create durable source chunks with `materialId`, section title, offsets/page/slide, hash, and text. First extract atomic concepts and evidence spans from chunks; then permit the curriculum planner to cite only those concept IDs. Require every topic/outcome to reference one or more spans and reject unsupported IDs. Surface the citations in the UI.

### 2. The output describes topics, not intended learning or proof of learning

The current data model stores descriptions, a broad `concept_type`, a free-text prerequisite field, and a time estimate. It does not store observable learning outcomes, success criteria, misconceptions, practice/activity type, or assessment evidence. This breaks constructive alignment: a topic can be “covered” without defining what a learner should be able to do or how the system will know it.

National Academies describes learning progressions as increasingly sophisticated thinking that can serve as a blueprint for instruction, formative evidence, and goals [1]. Biggs’s constructive-alignment formulation links intended performance, activities, and assessment [2].

**Recommendation:** introduce a versioned curriculum intermediate representation (IR): `outcome`, `prerequisiteOutcomeIds`, `sourceEvidenceIds`, `cognitiveLevel`, `practicePlan`, `masteryEvidence`, and `estimatedMinutes`. Modules should be a view derived from that graph rather than the sole source of truth. Deterministically fail orphan outcomes, duplicate concepts, cycles, unsupported outcomes, and outcomes lacking a mastery check.

### 3. Sequencing is a prompt instruction rather than a checked property

“Foundations first, then advanced” is the only ordering policy. `prerequisites` is stored as free text, not edges, so no code can prove that prerequisites appear before dependents or identify a missing prerequisite. The matcher’s title/fingerprint/substring logic is pragmatic for progress preservation but can conflate neighboring concepts during regeneration, especially where titles are short or generic.

IES recommends spaced learning, re-exposure through quizzes, worked examples interleaved with independent problems, and deep explanatory questions [3]. These are not naturally produced by a linear topical outline. The curriculum must be able to revisit an outcome, fade support, and branch to prerequisite repair based on evidence.

**Recommendation:** generate a directed acyclic graph; topologically sort it; compute and store a sequence rationale; and include explicit diagnostic, worked-example, retrieval, transfer, and repair nodes. Schedule reviews after delays, rather than treating a topic as a single pass. Keep the learner’s existing card/SRS system as delivery infrastructure, but map its evidence to outcome IDs rather than title similarity.

### 4. Valid JSON is not a semantic or pedagogical quality gate

The call requests `{ type: 'json_object' }`, `safeParseAIJson` repairs responses, and the only post-parse guard is that `modules` is an array. Required fields are not schema-validated; enums, numeric bounds, document ownership, unique coverage, estimates, and source IDs are not checked before writes. OpenAI’s Structured Outputs documentation distinguishes JSON mode from strict JSON Schema adherence and recommends schema-based structured output where supported [4]. Even schema adherence proves shape—not whether the model invented a concept or made an unsound pedagogical decision.

**Recommendation:** add provider-capability negotiation: use strict JSON Schema where available, retain JSON-mode fallback, and always run local validation. Validation should check nonempty modules and topics; IDs against the selected subject; title/description/estimate limits; controlled vocabularies; duplicate normalized titles; source coverage; provider stop/completion status; total scheduled time against the learner’s stated commitment; and graph integrity. Reject the entire response before mutation, retain the last valid curriculum, and return a specific error. A second model may critique grounding and alignment with a rubric, but it should never be the only gate.

### 5. Generation treats documents as trusted instructions

The curriculum prompt inserts raw material text and broad summaries directly beside the model instruction. A malicious or accidental instruction inside a PDF, note, or transcript can compete with the generation prompt. The tutor path has explicit prompt-injection isolation, but this curriculum path does not.

**Recommendation:** delimit each material as untrusted data, explicitly prohibit following instructions inside it, strip or classify instruction-like text during extraction, and keep curriculum policy in a system/developer-level message where the provider supports role separation. Log which chunks influenced the output.

### 6. There is no product-level evaluation or observability loop

The repository includes useful reconciliation and UI tests, but no golden corpus for generated curricula, semantic scoring, regression comparison, model/prompt/version provenance, or production-quality telemetry. NIST calls for documented test/evaluation/verification/validation, defined human oversight, and production monitoring [5]. UNESCO also calls for human-centred pedagogical validation in education use [6].

**Recommendation:** build 20–40 consented, de-identified golden cases spanning textbook, slides, transcript, sparse notes, multi-material, and update/regeneration scenarios. Score output against a rubric: source coverage/precision, prerequisite validity, outcome-assessment alignment, workload feasibility, duplication, accessibility, and preservation of completed work. Track scores by provider, model, prompt version, and corpus shape. Sample low-confidence plans for expert or user review.

## Synthesis & Insights

The present system has the raw ingredients of a strong product—material ownership, progress-safe reconciliation, a manual alternative, tutor context, practice generation, and SRS—but its central artifact is under-specified. A curriculum should be the durable contract that connects source evidence, learning outcomes, learner actions, and advancement evidence. Treating it as a formatted list leaves every downstream feature to infer semantics from titles. A compact, validated IR provides a far better foundation than continually extending a prompt.

## Recommendations

| Priority | Change | Why it comes first | Acceptance criteria |
|---|---|---|---|
| P0 | Restore the generation API contract, correct the default provider route, and reject empty/incomplete responses before any mutation. | Prevents silent data loss, false success, and default-generation timeouts. | Renderer receives its declared result shape; empty/truncated/malformed output preserves the prior plan; provider contract test passes. |
| P0 | Consolidate the two generators behind one curriculum IR and reconciliation path. | Eliminates behavior drift and protects progress everywhere. | One handler/service; creation and regeneration share fixtures; legacy replacement path removed or routed through reconciliation. |
| P0 | Add local schema and semantic validation before persistence. | Prevents malformed, invented, cyclic, ungrounded, or infeasible plans. | Invalid IDs, empty outcomes, cycles, bad enums, unsupported evidence, and budget overflow all fail with useful errors. |
| P1 | Chunk-backed evidence and provenance UI. | Makes content auditable and enables real coverage checks. | Every outcome/topic links to material section/page/offset; no uncited item is published. |
| P1 | Outcome/prerequisite graph plus alignment matrix. | Converts topical organization into a learning design. | Each outcome has prerequisites, practice, mastery evidence, and traceable source support; graph is acyclic. |
| P2 | Learning-science scheduler and mastery repair. | Adds spacing, retrieval, worked-to-independent practice, and real adaptation. | Delayed reviews and repair loops are generated from actual performance, not completion alone. |
| P3 | Golden-set evaluation, human calibration, and production telemetry. | Establishes a measurable quality bar across models and prompt releases. | CI report and release threshold; sampled-review workflow; prompt/model/source hashes logged. |

## Suggested implementation shape

Use a two-pass generation protocol. Pass one extracts source-grounded concepts/outcomes from bounded chunks. Pass two receives only that inventory and constructs the DAG, modules, schedule, and assessments. A deterministic validator then runs before reconciliation. If it fails, return a repair prompt containing only the specific failures; after one repair attempt, present a reviewable draft rather than silently saving a weak plan. The existing Manual syllabus remains the explicit alternative when a learner wants total editorial control.

At release time, evaluate both the current and proposed pipeline on the golden set. Do not claim learning efficacy from model preferences or schema validity. Compare grounded coverage, prerequisite errors, workload error, human rubric scores, learner edits, later retrieval performance, and transfer/problem-solving performance. Mastery learning can help when it uses explicit objectives, diagnostic evidence, support, and flexible time, but its implementation is challenging and evidence strength varies [7]; no single completion percentage should unlock advancement.

## Limitations

This was a static code and evidence review. I did not send real student materials to a provider, inspect production databases, or run a controlled learning study. The recommendation to implement graph checks, retrieval scheduling, and evaluation is an engineering inference drawn from the current architecture and the cited guidance; it is not a claim that every subject needs the same progression or assessment. Domain- and institution-specific outcomes should remain editable and reviewable by people.

## Bibliography

[1] National Academies of Sciences, Engineering, and Medicine. *How People Learn II: Learners, Contexts, and Cultures*, Chapter 9, “Assessment.” https://www.nationalacademies.org/read/24783/chapter/9

[2] Biggs, J. (1996). “Enhancing teaching through constructive alignment.” *Higher Education*, 32, 347–364. https://doi.org/10.1007/BF00138871

[3] Institute of Education Sciences, What Works Clearinghouse. *Organizing Instruction and Study to Improve Student Learning.* https://ies.ed.gov/ncee/wwc/PracticeGuide/1

[4] OpenAI. *Structured model outputs.* https://developers.openai.com/api/docs/guides/structured-outputs

[5] NIST. *AI RMF Core* and *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile* (NIST AI 600-1). https://airc.nist.gov/airmf-resources/airmf/5-sec-core/ ; https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf

[6] UNESCO. *Guidance for generative AI in education and research.* https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research

[7] Education Endowment Foundation. *Mastery learning.* https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/mastery-learning

[8] OpenAI. *Evaluation best practices.* https://developers.openai.com/api/docs/guides/evaluation-best-practices

[9] Australian Education Research Organisation. *How students learn best.* https://www.edresearch.edu.au/sites/default/files/2023-09/how-students-learn-best-aa_0.pdf

[10] Institute of Education Sciences, What Works Clearinghouse. *Improving Mathematical Problem Solving in Grades 4 Through 8.* https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/MPS_PG_043012.pdf

## Methodology

Reviewed the current main-process generation and reconciliation implementation, the class-creation generation path, the document topology summarizer, persistence schema, renderer entry points, and curriculum-related tests. Supplemented the implementation audit with primary/authoritative learning-science, AI-structured-output, AI-governance, and education-policy sources. Claims about Neuron’s behavior are traceable to the repository paths named above; recommendations labeled as design changes are inferences, not observed product behavior.
