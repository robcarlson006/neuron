import type {
  PracticeProblem
} from "../types"
import type { DomainClassificationResult, EpistemicArchetype } from "./classification/domainClassifier"

/**
 * Discipline-Specific Problem Design Paradigms
 * Integrates:
 * - Mathematics & STEM: Marton's Variation Theory (conceptual & procedural) + Catrambone's Subgoal Labeling
 * - English & Literature: Fisher & Frey's 4-layer Text-Dependent Question (TDQ) Progressions (Bridging Inferences)
 * - History & Social Studies: Sam Wineburg & SHEG History Assessments of Thinking (HATs: Sourcing, Contextualization, Corroboration, Close Reading)
 * - Philosophy & Logic: Deductive Validity vs. Empirical Soundness, Counterexample Method, Thought Experiments
 * - Clinical & Legal: Sequential Branching Triage & Rule-Conflict Audits
 * - Taxonomic & Structural: Minimal-Pair Contrasts & Morphological Syntax Mapping
 */
export function getDomainArchetypeInstructions(archetype: EpistemicArchetype): string {
  switch (archetype) {
    case 'formal_deductive':
    case 'empirical_physical':
      return `
## 🔬 DISCIPLINE PARADIGM: STEM / QUANTITATIVE (VARIATION THEORY & SUBGOAL LABELING)
1. **Marton's Variation Theory**:
   - **Conceptual Variation**: Present non-standard configurations, extreme boundary parameters, and explicit non-examples (e.g. obtuse triangles where altitude falls outside the polygon; vectors at non-orthogonal angles) alongside standard cases to isolate defining principles.
   - **Procedural Variation**: Systematically shift one operational parameter across critical thresholds (e.g. constant shifted across zero from real to degenerate to complex roots) while keeping the core structural model invariant.
2. **Catrambone's Subgoal Labeling**:
   - Explicitly organize multi-step derivations under named structural milestones (e.g., "Subgoal 1: Isolating the differential operator", "Subgoal 2: Establishing boundary constraints", "Subgoal 3: Evaluating the integral at limits").
3. **Bug-Hunter Error Audits & Faded Worked Examples**:
   - Provide realistic derivations containing a single subtle operational flaw (algebraic sign slip, conservation law violation, or skipped chain-rule factor); require the student to identify the exact step, state the broken principle, and correct it.
4. **Boundary Condition Probes**:
   - Challenge student to identify under what parameter values a theorem, physical equilibrium, or mathematical formula breaks down.`

    case 'social_behavioral':
      return `
## 📊 DISCIPLINE PARADIGM: SOCIAL & BEHAVIORAL SCIENCES / ECONOMICS / PSYCHOLOGY
1. **Two-Tier Diagnostic Vignettes**:
   - Tier 1: Real-world novel scenario (e.g., transit fare hike with $|E_d| = 1.4$, market shock, or cognitive dissonance paradigm) $\\rightarrow$ student predicts the directional equilibrium outcome.
   - Tier 2: Student must identify the exact theoretical mechanism justifying Tier 1.
   - Distractors in Tier 2 MUST model authentic student misconceptions (e.g., confusing a shift in demand with movement along the curve, or confusing negative reinforcement with punishment).
2. **Confound-Isolation & Policy Trade-Offs**:
   - Describe an empirical study or policy intervention; require the student to isolate confounding variables, distinguish correlation from causation, or resolve conflicting stakeholder incentives.`

    case 'interpretive_humanities':
      return `
## 📖 DISCIPLINE PARADIGM: ENGLISH, LITERATURE & READING (TEXT-DEPENDENT QUESTION PROGRESSIONS)
1. **Fisher & Frey's 4-Layer TDQ Progressions**:
   - **Layer 1 (General Understanding)**: Core narrative/argument sequence and literal comprehension.
   - **Layer 2 (Vocabulary & Text Structure)**: How specific figurative choices, syntactic patterns, or organizational devices shape tone, pacing, and irony.
   - **Layer 3 (Authorial Purpose & Perspective)**: Unpacking narrative unreliability, rhetorical techniques, and unstated ideological assumptions.
   - **Layer 4 (Deep Inference & Bridging Connections)**: Requiring examinees to integrate disparate premises located across distant paragraphs to uncover unstated causal connections rather than shallow lexical matching.
2. **Dialectical Thesis & Counterfactual Interrogation**:
   - Require student to formulate the strongest textual counter-argument or evaluate how an alternate structural/rhetorical choice would alter the thematic resolution.`

    case 'applied_clinical_legal':
      return `
## ⚖️ DISCIPLINE PARADIGM: APPLIED / CLINICAL MEDICINE / LAW / MANAGEMENT
1. **Sequential Branching Case Vignettes**:
   - Present a patient case, legal fact pattern, or corporate audit with incomplete data. Student must determine the next best diagnostic test, therapeutic step, or legal pleading under strict constraints.
2. **Rule-Conflict Resolution**:
   - Present a scenario where two established principles (e.g. Beneficence vs. Autonomy, or GAAP vs. Tax Accounting, or Speed vs. Accuracy) conflict, requiring balanced evidentiary justification.`

    case 'taxonomic_structural':
      return `
## 🌿 DISCIPLINE PARADIGM: TAXONOMIC & STRUCTURAL (ANATOMY / BOTANY / GEOLOGY / LANGUAGES)
1. **Minimal-Pair / Structural Contrast Puzzles**:
   - Contrast structures with minimal morphological or grammatical differences (e.g., Afferent vs. Efferent pathways, Xylem vs. Phloem, Ser vs. Estar).
2. **Morphological Syntax Mapping & Classification Trees**:
   - Provide authentic specimens or sentences requiring classification through dichotomous feature identification.`
  }
}

/**
 * Universal Item-Writing Constraints (Haladyna & NBME Standards)
 */
export const UNIVERSAL_ITEM_WRITING_CONSTRAINTS = `
## 📐 ITEM WRITING CONSTRAINTS (HALADYNA & NBME STANDARDS):

1. **Pass the Cover Test (Gold Standard)**:
   - The stem must contain a focused, complete problem statement ending with a direct question mark (\`?\`) or explicit imperative command.
   - A knowledgeable student must be able to anticipate/generate the correct answer with the options covered.
   - **PROHIBITED OPEN-CONCEPT STEMS**: Never write "Which of the following is true regarding X?", "Which statement is correct?", or "All of the following EXCEPT".

2. **Eliminate Test-Wiseness Cues**:
   - **Homogeneous Options**: Keep all options (A, B, C, D) homogeneous in length, grammatical structure, and syntax. The correct key must NOT be noticeably longer or more qualified than distractors.
   - **No Clang Associations**: Do NOT repeat uncommon or technical phrasing from the stem exclusively in the correct option.
   - **No Extreme Determiners**: Never use "always", "never", "completely", "entirely" in options.
   - **Strictly Prohibit Compound Choices**: NEVER use "All of the above", "None of the above", "Both A and C", or Type K clusters ("A and B").

3. **Distractor Quality & Targeted Cognitive Probing**:
   - Distractors must NEVER be absurd, humorous, or trivially false.
   - Every distractor must represent a verified, plausible student error state:
     - *Systemic Sign/Direction Inversion* (inverting signs/vectors, conservation law failures).
     - *Intermediate Step Trapping* (supplying the terminal result of a preliminary operational stage).
     - *Nominal-Conceptual Conflation* (rote surface-level association / phonetic clang).
     - *Spurious Boundary Overextension* (applying principle valid only in specialized contexts to unrestricted domain).
     - *Temporal or Causal Reversal* (post hoc ergo propter hoc; inverting antecedent and consequence).
   - Distractors must belong to the exact same logical and grammatical category as the correct answer.

4. **Positive Framing**:
   - Stems must be positively phrased. Avoid double negatives and unprompted negative phrasing ("NOT", "EXCEPT") unless measuring a specific safety-critical contraindication.

5. **LaTeX Mathematical & Scientific Notation**:
   - Wrap all mathematical equations, variables, exponents, coordinates, and scientific formulas in standard LaTeX delimiters ($...$ for inline, $$...$$ for block display).`

/**
 * Build prompt for extracting practice problems from a section of source material.
 * Dynamically adapts to source modality and universal epistemic archetype.
 */
export function buildExtractPracticeProblemsPrompt(
  text: string,
  subjectName: string,
  moduleTitle?: string,
  topicTitle?: string,
  domainResult?: DomainClassificationResult,
  modality: 'slides' | 'textbook' | 'transcript' | 'general' = 'general'
): string {
  const context = [
    `Subject: ${subjectName}`,
    moduleTitle ? `Module: ${moduleTitle}` : null,
    topicTitle ? `Topic: ${topicTitle}` : null,
  ].filter(Boolean).join("\n")

  const archetype: EpistemicArchetype = domainResult?.primaryArchetype || 'formal_deductive'
  const domainInstructions = getDomainArchetypeInstructions(archetype)

  let modalitySpecificInstructions = ''
  if (modality === 'slides') {
    modalitySpecificInstructions = `
## 📑 SOURCE MODALITY TRANSFORMATION: SLIDE PRESENTATIONS
- Slide decks feature bullet points and fragmented summaries. Reconstruct the unstated causal links connecting bullet points.
- Do NOT generate shallow recall items that simply repeat slide bullets. Transform bulleted lists into applied, scenario-based trade-off dilemmas.
- If architectural models, process charts, or data tables are referenced, formulate questions requiring the student to interpret relationships, predict system behaviors, or diagnose points of failure.`
  } else if (modality === 'textbook') {
    modalitySpecificInstructions = `
## 📚 SOURCE MODALITY TRANSFORMATION: TEXTBOOKS (BOTTOM-UP INVERSION)
- Textbooks present knowledge top-down (concept $\\rightarrow$ properties $\\rightarrow$ example). Invert this structure: present raw observational data, primary artifacts, or real-world dilemmas and require the student to deduce the underlying principle or model.
- Avoid near-transfer mimicry (merely swapping numbers). Shift surface context to novel, unfamiliar settings (far transfer) or introduce boundary edge cases.`
  } else if (modality === 'transcript') {
    modalitySpecificInstructions = `
## 🎙️ SOURCE MODALITY TRANSFORMATION: LECTURE TRANSCRIPTS
- Denoise: Filter out conversational filler, administrative announcements, and transcription errors.
- Isolate Clinical Anecdotes & Case Studies: Strip away incidental chatter while preserving the core conceptual challenge.
- Harvest Lecturer Warnings: Transform instructor comments about where students typically get confused or common exam traps into highly diagnostic distractors.`
  }

  return `You are a Principal Psychometrician and Master Assessment Designer operating under formal testing standards (NBME, USMLE, College Board AP).
Your mission is to transform the provided source text into rigorous, valid practice problems that measure deep conceptual understanding, analytical reasoning, and practical transfer (Webb's DOK Level 2 or Level 3).

${context}

SOURCE TEXT:
<source_material>
${text}
</source_material>

${modalitySpecificInstructions}

${domainInstructions}

${UNIVERSAL_ITEM_WRITING_CONSTRAINTS}

## REQUIRED OUTPUT SCHEMA (STRICT JSON):
Respond exclusively with a JSON object structured as follows (no markdown fences, no conversational preamble):
{
  "problems": [
    {
      "title": "Short descriptive title of problem",
      "target_learning_objective": "Specific competency, mechanism, or principle assessed",
      "cognitive_level": {
        "blooms_revised": "Apply | Analyze | Evaluate | Create",
        "webbs_dok": "DOK2 | DOK3"
      },
      "stimulus": "The scenario, vignette, or contextual passage (or null if integrated directly into problem_text)",
      "stem_lead_in": "The direct interrogative question ending in a question mark (passes Cover Test)",
      "problem_text": "Full problem prompt combining stimulus and stem_lead_in using LaTeX for math",
      "options": {
        "A": "Option A text",
        "B": "Option B text",
        "C": "Option C text",
        "D": "Option D text"
      },
      "correct_key": "A | B | C | D",
      "subgoals": [
        "Subgoal 1: Named structural milestone",
        "Subgoal 2: Named structural milestone"
      ],
      "solution_steps": "Detailed step-by-step analytical derivation showing intermediate landmark steps and subgoals.",
      "final_answer": "Concise verified final answer with exact units or diagnostic mechanism.",
      "difficulty": 3,
      "principles": ["Principle 1", "Core Formula"],
      "suggested_topic": "${topicTitle || moduleTitle || subjectName}",
      "item_validation": {
        "cover_test_rationale": "Explanation confirming the stem is answerable independently before viewing options",
        "key_explanation": "Rigorous defense of the correct option",
        "distractor_analysis": {
          "distractor_1": {
            "option": "Incorrect Option B",
            "misconception_exposed": "Identifies the exact student cognitive error",
            "distractor_strategy": "sign_inversion | intermediate_step | nominal_conflation | boundary_overextension | causal_reversal"
          },
          "distractor_2": {
            "option": "Incorrect Option C",
            "misconception_exposed": "Identifies the exact student cognitive error",
            "distractor_strategy": "intermediate_step"
          },
          "distractor_3": {
            "option": "Incorrect Option D",
            "misconception_exposed": "Identifies the exact student cognitive error",
            "distractor_strategy": "boundary_overextension"
          }
        }
      }
    }
  ]
}`
}

/**
 * Build prompt for slide deck practice problem extraction.
 */
export function buildSlideDeckPracticeExtractionPrompt(
  text: string,
  subjectName: string,
  moduleTitle?: string,
  topicTitle?: string,
  domainResult?: DomainClassificationResult
): string {
  return buildExtractPracticeProblemsPrompt(text, subjectName, moduleTitle, topicTitle, domainResult, 'slides')
}

/**
 * Build prompt for textbook practice problem extraction.
 */
export function buildTextbookPracticeExtractionPrompt(
  text: string,
  subjectName: string,
  moduleTitle?: string,
  topicTitle?: string,
  domainResult?: DomainClassificationResult
): string {
  return buildExtractPracticeProblemsPrompt(text, subjectName, moduleTitle, topicTitle, domainResult, 'textbook')
}

/**
 * Build prompt for lecture transcript practice problem extraction.
 */
export function buildTranscriptPracticeExtractionPrompt(
  text: string,
  subjectName: string,
  moduleTitle?: string,
  topicTitle?: string,
  domainResult?: DomainClassificationResult
): string {
  return buildExtractPracticeProblemsPrompt(text, subjectName, moduleTitle, topicTitle, domainResult, 'transcript')
}

/**
 * Build prompt to generate a new isomorphic or conceptual variant of a practice problem.
 * Supports both mathematical computational twins (CBIT) and conceptual/counterfactual twins across any subject.
 */
export function buildGenerateVariantPrompt(
  baseProblem: PracticeProblem,
  userStruggles?: string
): string {
  const principles = (() => {
    try {
      return JSON.parse(baseProblem.principles_json || "[]")
    } catch {
      return []
    }
  })()

  return `You are a Principal Psychometrician and Cognitive Learning Scientist specializing in Automated Item Generation (AIG), Variation Theory, and Conceptual Transfer.
Generate a brand new practice problem that is structurally and conceptually ISOMORPHIC to the base problem below.

BASE PROBLEM:
Title: ${baseProblem.title}
Difficulty: ${baseProblem.difficulty}/5
Principles: ${principles.join(", ")}

Problem Statement:
"""
${baseProblem.problem_text}
"""

Original Solution Steps:
"""
${baseProblem.solution_steps || "N/A"}
"""

Original Final Answer:
"""
${baseProblem.final_answer || "N/A"}
"""

${userStruggles ? `STUDENT'S PREVIOUS STRUGGLE / MISCONCEPTION:\n"${userStruggles}"\nTailor the variant to directly test and remediate this specific misconception while maintaining clean solvability.` : ""}

THE 4-LAYER ISOMORPHIC BLUEPRINT:
1. **LAYER 1 (Structural & Subgoal Invariance)**:
   - Preserve the exact underlying theoretical model, governing equations, first-order conditions, or diagnostic mechanism.
   - Preserve Catrambone's Subgoal progression milestones.
2. **LAYER 2 (Marton's Variation Theory & Clean Parameter Clamping - CBIT)**:
   - For quantitative tasks: Systematically alter operational parameters using Constraint-Based Item Generation (CBIT) so that intermediate numbers and final answers resolve to clean integers or simple fractions/decimals (e.g. 2.5, 0.25, 4/3). Avoid accidental irrational values.
   - For qualitative tasks: Shift scenario entities and contexts to test far transfer while maintaining crisp boundary definitions.
3. **LAYER 3 (NBME Cover Test & Haladyna Distractor Diagnostics)**:
   - The stem must pass the Cover Test (ending in \`?\`).
   - If options are provided, ensure strict option homogeneity, absence of clang associations, and diagnostic distractor modeling (sign inversion, intermediate step, boundary overextension).
4. **LAYER 4 (Backward Verification Pass)**:
   - Verify that the final answer satisfies all physical/theoretical constraints without unstated assumptions.
   - Format all math and variables in standard LaTeX ($...$ and $$...$$).

Output ONLY a valid JSON object matching this schema:
{
  "title": "Variant: Descriptive Title",
  "problem_text": "New problem prompt with newly calibrated parameters/vignette and clear instructions using LaTeX.",
  "stem_lead_in": "Direct interrogative question passing the Cover Test",
  "options": {
    "A": "Option A",
    "B": "Option B",
    "C": "Option C",
    "D": "Option D"
  },
  "correct_key": "A | B | C | D",
  "subgoals": ["Subgoal 1", "Subgoal 2"],
  "solution_steps": "Flawless step-by-step derivation for this new problem with subgoal labeling.",
  "final_answer": "Verified final concise answer with units or mechanism.",
  "difficulty": ${baseProblem.difficulty},
  "principles": ${JSON.stringify(principles)},
  "item_validation": {
    "cover_test_rationale": "Why stem is independently answerable",
    "key_explanation": "Defense of key",
    "distractor_analysis": {
      "distractor_1": { "option": "Option", "misconception_exposed": "Misconception", "distractor_strategy": "sign_inversion" }
    }
  }
}`
}

/**
 * Build prompt for evaluating a student's attempt on a practice problem with Diagnostic Error Taxonomy.
 * Works universally across quantitative derivations, multi-tier choices, and constructive short essays.
 */
export function buildEvaluatePracticeAttemptPrompt(
  problem: PracticeProblem,
  userAnswer: string
): string {
  return `You are a warm, rigorous Socratic tutor and educational diagnostician evaluating a student's attempt at solving a practice problem.

PROBLEM STATEMENT:
"""
${problem.problem_text}
"""

REFERENCE SOLUTION & DERIVATION:
"""
${problem.solution_steps || problem.final_answer || "N/A"}
"""

TARGET FINAL ANSWER:
"""
${problem.final_answer || "N/A"}
"""

STUDENT'S SUBMITTED WORK / ANSWER:
"""
${userAnswer}
"""

EVALUATION & ERROR TAXONOMY GUIDELINES:
1. Determine mathematical, logical, and conceptual validity (is_correct: true/false). Allow for algebraically equivalent forms (e.g. $1/2$ vs $0.5$) unless a specific representation was requested.
2. Classify the error into one of the following precise pedagogical categories (error_type):
   - "correct": The derivation/reasoning and final result are sound.
   - "execution_slip": The conceptual setup was completely correct, but a minor arithmetic, sign, or grammatical slip occurred.
   - "conceptual_misconception": Applied the wrong fundamental principle, confused causation with correlation, or inverted a core formula.
   - "boundary_condition_error": Overlooked domain limits, feasibility constraints, or edge-case conditions.
   - "unit_mismatch": Failed to convert or match physical/economic units.
   - "other": Incomplete work or unrelated input.
3. Socratic Feedback: Provide encouraging, constructive feedback. If there is an error, provide a "pedagogical_remedy" hint that prompts them to rethink the flawed step without giving away the answer.
4. Format all equations and mathematical variables with LaTeX ($...$).

Output ONLY a valid JSON object matching this schema:
{
  "is_correct": true,
  "error_type": "correct",
  "feedback": "Detailed, encouraging feedback reviewing their derivation/reasoning.",
  "pedagogical_remedy": "Socratic guidance question or hint for their specific error type.",
  "step_analysis": ["Step 1: Correctly formulated setup", "Step 2: Analysis of subsequent step"],
  "identified_errors": [],
  "key_principles": ["Principle applied"],
  "suggested_next_action": "continue"
}`
}

export interface BuildAutonomousPracticeProblemPromptParams {
  subjectName: string
  moduleTitle?: string
  topicTitle?: string
  materialsText?: string
  exemplarProblems?: PracticeProblem[]
  ckrfContext?: string
  count?: number
  autoCount?: boolean
  difficultyFocus?: 'adaptive' | 'remediate_struggles' | 'foundational' | 'challenge'
  domainResult?: DomainClassificationResult
  customInstructions?: string
}

/**
 * 4-Layer Autonomous Practice Problem Generation Prompt Builder.
 * Integrates:
 * 1. Curator Layer: Syllabus hierarchy & extracted source materials
 * 2. Blueprint Synthesizer Layer: Few-shot exemplar problems for style & format calibration
 * 3. Constraint-Based Generator Layer (CBIT + CKRF): Active learner misconceptions & parameter clamping
 * 4. Backward Verification Pass: Self-contained, logically sound step-by-step verification
 */
export function buildAutonomousPracticeProblemPrompt(
  params: BuildAutonomousPracticeProblemPromptParams
): string {
  const {
    subjectName,
    moduleTitle,
    topicTitle,
    materialsText,
    exemplarProblems = [],
    ckrfContext,
    count = 4,
    autoCount = false,
    difficultyFocus = 'adaptive',
    domainResult,
    customInstructions
  } = params

  const contextLines = [
    `Subject: ${subjectName}`,
    moduleTitle ? `Module: ${moduleTitle}` : null,
    topicTitle ? `Topic: ${topicTitle}` : null,
    `Target Difficulty/Focus: ${difficultyFocus.replace('_', ' ').toUpperCase()}`
  ].filter(Boolean).join("\n")

  const archetype: EpistemicArchetype = domainResult?.primaryArchetype || 'formal_deductive'
  const domainInstructions = getDomainArchetypeInstructions(archetype)

  // 1. Curator Layer (Source Material context)
  const materialSection = materialsText && materialsText.trim().length > 0
    ? `CURRICULUM SOURCE MATERIALS & LECTURE CONTEXT:
<source_material>
${materialsText.trim()}
</source_material>`
    : `CURRICULUM TOPIC CONTEXT:
No raw document was directly attached. Base the problem generation strictly on standard university-level concepts, theorems, equations, and real-world applications within: "${subjectName} > ${moduleTitle || 'General'} > ${topicTitle || 'Core Principles'}".`

  // 2. Blueprint Synthesizer (Few-Shot Exemplars)
  let exemplarSection = ""
  if (exemplarProblems.length > 0) {
    exemplarSection = `
EXEMPLAR PRACTICE PROBLEMS (USER STYLE & DIFFICULTY BLUEPRINT):
The user/instructor previously uploaded or solved the following practice problems. Study them as a benchmark for format, phrasing style, difficulty level, and pedagogical depth. Synthesize problems that feel like natural, complementary additions to this problem bank:
${exemplarProblems.map((ex, idx) => {
  let parsedPrinciples: string[] = []
  try {
    parsedPrinciples = JSON.parse(ex.principles_json || "[]")
  } catch {
    parsedPrinciples = []
  }
  return `--- Exemplar #${idx + 1} ---
Title: ${ex.title}
Difficulty: ${ex.difficulty}/5
Principles: ${parsedPrinciples.join(", ") || "Standard"}
Problem Statement:
${ex.problem_text}
${ex.solution_steps ? `Solution Steps:\n${ex.solution_steps}` : ""}
${ex.final_answer ? `Final Answer: ${ex.final_answer}` : ""}
`
}).join("\n")}`
  }

  // 3. CKRF Cognitive Model & Misconception Targeting
  let ckrfSection = ""
  if (ckrfContext && ckrfContext.trim().length > 0) {
    ckrfSection = `
STUDENT'S ACTIVE LEARNING PROFILE & DIAGNOSTIC COGNITIVE STATE:
"""
${ckrfContext.trim()}
"""

TARGETED REMEDIATION DIRECTIVE:
The student's diagnostic profile contains active misconceptions and competency ratings above.
Design at least 1 or 2 problems specifically calibrated as "hinge-point diagnostics" or "bug-hunter audits" to directly test and inoculate against these known student struggles (e.g. including common misconception traps as plausible distractors or tricky intermediate steps).`
  }

  // 4. Custom Natural Language Focus / User Directives
  let customSection = ""
  if (customInstructions && customInstructions.trim().length > 0) {
    customSection = `
USER'S CUSTOM FOCUS & NATURAL LANGUAGE DIRECTIVES:
"""
${customInstructions.trim()}
"""
Give strong priority to these specific user instructions when crafting the scenarios, topics, question types, and target problem domains.`
  }

  // 5. Batch Sizing Instruction
  const batchInstruction = autoCount
    ? `BATCH SIZING (AI DECIDES):
Determine the optimal number of problems (typically between 3 and 5) required to comprehensively test the fundamental concepts, edge cases, and active misconceptions for this topic without repetitive padding or bloat.`
    : `BATCH SIZING:
Generate exactly ${Math.min(10, Math.max(1, count))} practice problems.`

  return `You are a Principal Psychometrician and Master Assessment Designer operating under formal testing guidelines (NBME, USMLE, College Board AP).
Your mission is to autonomously engineer high-transfer, authentic practice problems tailored to the student's curriculum and cognitive state (Webb's DOK Level 2 or Level 3).

SCOPE & HIERARCHY:
${contextLines}

${materialSection}
${exemplarSection}
${ckrfSection}
${customSection}

${domainInstructions}

${UNIVERSAL_ITEM_WRITING_CONSTRAINTS}

THE 4-LAYER AUTONOMOUS GENERATION ENGINE DIRECTIVES:
1. **LAYER 1: CURRICULUM GROUNDING & NO TRIVIAL RECALL**
   - Every problem must test functional application, procedural fluency, or theoretical mechanism analysis (Webb's Depth of Knowledge Level 2 or 3).
   - Never ask simple verbatim flashcard recall (e.g., "What is the definition of X?").
   - Frame authentic, novel, realistic scenarios and vignettes. Never refer to "the text", "the slide", or "the handout".

2. **LAYER 2: BLUEPRINT HARMONIZATION**
   - Mirror the pedagogical rigor, notation style, and problem-solving depth of the provided exemplars (if present).
   - If exemplars are multi-part or multi-tier, incorporate similar structural richness.

3. **LAYER 3: CONSTRAINT-BASED PARAMETER CLAMPING (CBIT)**
   - For quantitative problems: Calibrate all coefficients, dimensions, and initial parameters so that the intermediate calculations and final answers resolve to clean, elegant numbers (integers or simple fractions/decimals like 2.5, 0.25, 4/3). Do NOT produce messy, accidental irrational values unless specifically testing numerical approximations.
   - For qualitative/conceptual problems: Ensure that distinction boundaries are crisp and free of ambiguous interpretations.

4. **LAYER 4: BACKWARD VERIFICATION PASS**
   - Formulate and verify the complete step-by-step solution internally before outputting.
   - Confirm that all initial values and boundary conditions necessary to solve the problem are explicitly stated.
   - Confirm the final answer follows deductively without unstated assumptions.
   - Format all mathematical equations, variables, and units using LaTeX ($...$ inline and $$...$$ block).

${batchInstruction}

Output ONLY a valid JSON object matching this schema (no markdown fences, no conversational preamble):
{
  "rationale": "Brief 1-2 sentence explanation of how this problem set targets key concepts, exemplars, or misconceptions.",
  "problems": [
    {
      "title": "Descriptive, engaging problem title",
      "target_learning_objective": "Specific competency assessed",
      "cognitive_level": {
        "blooms_revised": "Apply | Analyze | Evaluate | Create",
        "webbs_dok": "DOK2 | DOK3"
      },
      "stimulus": "Vignette or contextual scenario",
      "stem_lead_in": "Direct question ending in a question mark passing Cover Test",
      "problem_text": "Complete self-contained problem statement using LaTeX for all formulas and variables.",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "correct_key": "A | B | C | D",
      "subgoals": ["Subgoal 1", "Subgoal 2"],
      "solution_steps": "Flawless step-by-step derivation showing intermediate milestones and reasoning.",
      "final_answer": "Concise verified final answer with units or diagnostic conclusion.",
      "difficulty": 3,
      "principles": ["Principle 1", "Core Formula/Mechanism"],
      "suggested_topic": "${topicTitle || moduleTitle || subjectName}",
      "pedagogical_target": "Specific skill, concept boundary, or misconception tested",
      "item_validation": {
        "cover_test_rationale": "Why stem is independently answerable",
        "key_explanation": "Defense of key",
        "distractor_analysis": {
          "distractor_1": { "option": "Option", "misconception_exposed": "Misconception", "distractor_strategy": "sign_inversion" }
        }
      }
    }
  ]
}`
}
