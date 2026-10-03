# Findings

## Current Tutor Context Pipeline

- `electron/ipc/tutorHandlers.ts` builds a large system instruction on every turn.
- Conversation history is limited to the last 30 messages at `tutorHandlers.ts:2170-2174`.
- Direct attached content is truncated to 32,000 characters at `tutorHandlers.ts:2176-2181`.
- A selected material is sent in full only when it is 16,000 characters or smaller; larger material is reduced to topology plus sampled chunks at `tutorHandlers.ts:1808-1829` and `1851-1869`.
- Automatic subject materials load at most five documents; each document over 8,000 characters is reduced to an outline plus its first three topology chunks at `tutorHandlers.ts:1887-1903`.
- Annotation context is limited to 100 rows and approximately 12,000 characters at `tutorHandlers.ts:1974-2004`.
- Retrieved evidence is added with a 14,000-character budget through `buildEvidenceContext(..., 14000)` at `tutorHandlers.ts:2056-2065`.
- Streaming output is capped at 4,096 generated tokens in `electron/ipc/aiHandlers.ts:429-435`.
- The chat input itself has no `maxLength`; typed messages are saved and passed through without an app-level character cutoff.

## Current Retrieval/Memory Signals

- A grounded retrieval module already exists in `src/lib/groundedRetrieval.ts` and is used by Tutor for per-turn evidence.
- Tutor memory includes historical topic memories, concept mastery/BKT, CKRF-related records, SRS topic memory, session evaluations, and transcript messages.
- Tutor prompt memory blocks use bounded lists, but memory is mostly serialized into prompt text rather than selected through a unified memory policy.
- The app persists complete transcripts, but prompt history only exposes the recent window.

## Risks

- Sampling by document topology can omit the exact passage needed to answer a question.
- “Complete topology awareness” instructions may cause the model to infer content from section titles without evidence.
- Large system prompts, retrieved evidence, history, annotations, and attached content compete for the provider's context window.
- Memory records have different semantics (durable facts, transient episodes, mastery estimates, source excerpts) but are currently mixed across prompt blocks and tables.

## Repository State

- The worktree contains many existing user changes. This planning task must not overwrite or clean them.

## Research Findings

- Long-context capacity does not guarantee reliable use: Liu et al. show a U-shaped position effect, with worse performance when relevant evidence is in the middle of a long context. This supports retrieval and evidence ordering over dumping whole documents.
- RAG combines parametric model knowledge with an explicit non-parametric index and improves specificity/factuality on knowledge-intensive tasks, but retrieval quality and provenance remain central design concerns.
- Self-RAG supports adaptive retrieval and critique rather than blindly injecting a fixed number of passages. For Neuron, this translates to a deterministic retrieve → sufficiency gate → answer/abstain → verification policy.
- Hybrid retrieval should remain a first-class path. Neuron already combines semantic and lexical retrieval; the next step is better chunk metadata, query rewriting, candidate fusion, and reranking rather than replacing lexical search.
- Long-term assistant memory research consistently separates short-term/session context from episodic and semantic memory. Neuron should keep transcripts as immutable episodes, then promote only validated learner facts and teaching strategies into durable memory.
- Long-term memory benchmarks such as LoCoMo/LongMemEval show that long conversations still produce temporal and causal failures even with long-context models or RAG. Neuron therefore needs memory-retrieval and end-to-end tutoring evaluations, not only unit tests.
- Knowledge tracing models estimate latent mastery from observed learner interactions; uncertainty matters because sparse evidence should not be treated as confident mastery. Neuron's BKT, Glicko-style ratings, misconceptions, and SRS should be unified as evidence streams with confidence and recency.
- Educational reviews support retrieval practice and spaced practice for durable learning. The tutor memory system should use memory to choose the next diagnostic retrieval question, not merely personalize prose.

## Primary Research Sources

- Liu et al., “Lost in the Middle: How Language Models Use Long Contexts,” TACL 2024: https://aclanthology.org/2024.tacl-1.9/
- Lewis et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks,” 2020: https://arxiv.org/abs/2005.11401
- Asai et al., “Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection,” 2023: https://arxiv.org/abs/2310.11511
- Santhanam et al., “ColBERTv2,” NAACL 2022: https://aclanthology.org/2022.naacl-main.272/
- Maharana et al., “Evaluating Very Long-Term Conversational Memory of LLM Agents,” ACL 2024: https://aclanthology.org/2024.acl-long.747/
- Packer et al., “Memory Matters: The Need to Improve Long-Term Memory in LLM-Agents,” AAAI Symposium 2023: https://ojs.aaai.org/index.php/AAAI-SS/article/view/27688
- Piech et al., “Deep Knowledge Tracing,” 2015/PMC version: https://pmc.ncbi.nlm.nih.gov/articles/PMC7334675/
- Carpenter, Pan, and Butler, “The science of effective learning with spacing and retrieval practice,” Nature Reviews Psychology 2022: https://www.nature.com/articles/s44159-022-00089-1
- Agarwal, Nunes, and Blunt, “Retrieval Practice Consistently Benefits Student Learning,” 2021: https://doi.org/10.1007/s10648-021-09595-9
