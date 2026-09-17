import type { PracticeProblem } from "../types"
import type { DomainClassificationResult, EpistemicArchetype } from "./classification/domainClassifier"

/**
 * Build prompt for extracting practice problems from a section of source material.
 * Dynamically adapts to the Universal Epistemic Archetype of the material:
 * - Formal/STEM: Faded Step Derivations & Bug-Hunter Error Audits (e.g. DCF schedules with accounting violations)
 * - Social/Behavioral: Two-Tier Diagnostic MCQs with Misconception-driven Distractors
 * - Humanities: Counterfactual Text Interrogations with 3-Criterion Rubrics
 * - Applied/Clinical/Legal: Sequential Branching Triage & Rule-Conflict Audits
 * - Taxonomic/Languages: Contrast Pairs & Morphological Mapping
 */
export function getDomainArchetypeInstructions(archetype: EpistemicArchetype): string {
  switch (archetype) {
    case 'formal_deductive':
    case 'empirical_physical':
      return `
DOMAIN-SPECIFIC PROBLEM ARCHETYPES (STEM / FORMAL / QUANTITATIVE):
1. BUG-HUNTER / ERROR-AUDITING:
   - Provide a realistic worked derivation, proof, or financial schedule (e.g., an 8-year DCF schedule with depreciation or working capital violations, or a calculus derivation with an algebraic sign slip).
   - Task: Student must locate the exact line/step violation, explain the theoretical rule broken, and compute the corrected adjustment.
2. FADED WORKED EXAMPLES (Sweller Completion Effect):
   - Provide a multi-step derivation where Steps 1 & 2 are completely shown, but the student must actively execute the pivotal Step 3.
3. BOUNDARY CONDITION PROBES:
   - Challenge student to identify under what parameter values a theorem, equilibrium, or physical constraint breaks down.`

    case 'social_behavioral':
      return `
DOMAIN-SPECIFIC PROBLEM ARCHETYPES (SOCIAL & BEHAVIORAL SCIENCES / ECONOMICS / PSYCHOLOGY):
1. TWO-TIER DIAGNOSTIC VIGNETTES:
   - Tier 1: Real-world novel scenario (e.g., transit fare hike with |E_d| = 1.4 or cognitive dissonance task) -> student predicts the directional outcome.
   - Tier 2: Student must select the exact theoretical/behavioral mechanism justifying Tier 1.
   - Distractors in Tier 2 MUST represent authentic, common student misconceptions (e.g. confusing demand curve shift with movement along the curve, or confusing negative reinforcement with punishment).
2. CONFOUND-ISOLATION VIGNETTES:
   - Describe an empirical study or policy intervention; ask student to identify the confounding variable that explains why the predicted effect failed.`

    case 'interpretive_humanities':
      return `
DOMAIN-SPECIFIC PROBLEM ARCHETYPES (HUMANITIES / ENGLISH / HISTORY / PHILOSOPHY):
1. COUNTERFACTUAL TEXTUAL INTERROGATIONS:
   - Present an excerpt from the material and ask: "Suppose the author had omitted passage X or reversed the sequence of events. How would the thematic resolution or ethical argument be fundamentally altered?"
2. DIALECTICAL THESIS & REBUTTAL:
   - State a provocative interpretive claim grounded in the text; require the student to formulate the strongest textual counter-argument.
   - Include a 3-criterion analytical evaluation rubric: (1) Textual Evidence, (2) Structural/Rhetorical Form, (3) Dialectical Rebuttal.`

    case 'applied_clinical_legal':
      return `
DOMAIN-SPECIFIC PROBLEM ARCHETYPES (APPLIED / CLINICAL MEDICINE / LAW / CORPORATE STRATEGY):
1. SEQUENTIAL BRANCHING CASE VIGNETTES:
   - Present a patient case, legal fact pattern, or corporate audit with incomplete data. Student must determine the next best diagnostic test or legal pleading.
2. RULE-CONFLICT RESOLUTION:
   - Present a scenario where two established principles (e.g. Beneficence vs Autonomy, or GAAP vs Tax Accounting) conflict, requiring balanced justification.`

    case 'taxonomic_structural':
      return `
DOMAIN-SPECIFIC PROBLEM ARCHETYPES (ANATOMY / BOTANY / GEOLOGY / LANGUAGES):
1. MINIMAL-PAIR / STRUCTURAL CONTRAST PUZZLES:
   - Contrast structures with minimal morphological or grammatical differences (e.g., Afferent vs Efferent pathways, or Ser vs Estar).
2. MORPHOLOGICAL SYNTAX MAPPING:
   - Provide an authentic context with syntax/morphological transformations.`
  }
}

/**
 * Build prompt for extracting practice problems from a section of source material.
 * Dynamically adapts to the Universal Epistemic Archetype of the material:
 * - Formal/STEM: Faded Step Derivations & Bug-Hunter Error Audits (e.g. DCF schedules with accounting violations)
 * - Social/Behavioral: Two-Tier Diagnostic MCQs with Misconception-driven Distractors
 * - Humanities: Counterfactual Text Interrogations with 3-Criterion Rubrics
 * - Applied/Clinical/Legal: Sequential Branching Triage & Rule-Conflict Audits
 * - Taxonomic/Languages: Contrast Pairs & Morphological Mapping
 */
export function buildExtractPracticeProblemsPrompt(
  text: string,
  subjectName: string,
  moduleTitle?: string,
  topicTitle?: string,
  domainResult?: DomainClassificationResult
): string {
  const context = [
    `Subject: ${subjectName}`,
    moduleTitle ? `Module: ${moduleTitle}` : null,
    topicTitle ? `Topic: ${topicTitle}` : null,
  ].filter(Boolean).join("\n")

  const archetype: EpistemicArchetype = domainResult?.primaryArchetype || 'formal_deductive'
  const domainInstructions = getDomainArchetypeInstructions(archetype)

  return `You are an elite academic professor and master diagnostic assessment psychometrician.
Your mission is to extract and synthesize high-transfer, cognitively rigorous practice problems based SOLELY on the provided source text section.

${context}

SOURCE TEXT:
"""
${text}
"""

${domainInstructions}

CRITICAL PEDAGOGICAL & GROUNDING REQUIREMENTS:
1. NO TRIVIAL RECALL: Never ask questions that can be answered by simple keyword matching or verbatim dictionary definitions. Questions must test application, mechanism identification, or procedural error-detection (Webb's Depth of Knowledge Level 2 or 3).
2. SELF-CONTAINED CONTEXT: Frame realistic, real-world vignettes. Never say "According to the slide" or "As the professor mentioned".
3. STEP-BY-STEP DERIVATION: Provide full, rigorous step-by-step solution steps showing intermediate landmark calculations and clear reasoning.
4. ZERO HALLUCINATIONS: Extract and ground all principles, formulas, and scenarios STRICTLY in the SOURCE TEXT. Format all math and variables with LaTeX notation ($...$ for inline, $$...$$ for display equations).

Output ONLY a valid JSON object matching this schema (no markdown fences, no conversational preamble):
{
  "problems": [
    {
      "title": "Short descriptive title of problem",
      "problem_text": "Full problem prompt with numbers/vignette and clear instructions using LaTeX.",
      "solution_steps": "Detailed step-by-step analytical derivation showing intermediate landmark steps.",
      "final_answer": "Concise final answer with exact units or diagnostic mechanism.",
      "difficulty": 3,
      "principles": ["Principle 1", "Formula 2"],
      "suggested_topic": "Topic Name"
    }
  ]
}
`
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

  return `You are a world-class cognitive learning scientist and psychometrician specializing in Automated Item Generation (AIG) and Conceptual Transfer.
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

${userStruggles ? `STUDENT'S PREVIOUS STRUGGLE / MISCONCEPTION:\n"${userStruggles}"\nTailor the variant to reinforce the specific principle the student struggled with while maintaining clean solvability.` : ""}

THE 4-LAYER ISOMORPHIC BLUEPRINT:
1. LAYER 1 (Structural Invariance): Preserve the exact underlying theoretical model, governing equations, first-order conditions, or diagnostic mechanism.
2. LAYER 2 (Clean Parameter Clamping / CBIT): If quantitative, sample values using Constraint-Based Item Generation (CBIT) such that calculations resolve to clean integers or simple terminating decimals. If conceptual/qualitative, calibrate scenario facts to eliminate unintended ambiguities.
3. LAYER 3 (Narrative & Domain Transfer): Shift the real-world scenario, entity names, or industrial/physical context to test deep conceptual transfer rather than superficial pattern-matching.
4. LAYER 4 (Backward Verification Pass): Verify that the final answer satisfies all constraints and theoretical laws. Format all math/variables in LaTeX ($...$ and $$...$$).
5. ZERO HALLUCINATIONS: Remain strictly within the scope and principles demonstrated in the BASE PROBLEM.

Output ONLY a valid JSON object matching this schema:
{
  "title": "Variant: Descriptive Title",
  "problem_text": "New problem prompt with newly calibrated parameters/vignette and clear instructions using LaTeX.",
  "solution_steps": "Flawless step-by-step derivation for this new problem.",
  "final_answer": "Verified final concise answer with units or mechanism.",
  "difficulty": ${baseProblem.difficulty},
  "principles": ${JSON.stringify(principles)}
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
    domainResult
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
"""
${materialsText.trim()}
"""`
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

  // 4. Batch Sizing Instruction
  const batchInstruction = autoCount
    ? `BATCH SIZING (AI DECIDES):
Determine the optimal number of problems (typically between 3 and 5) required to comprehensively test the fundamental concepts, edge cases, and active misconceptions for this topic without repetitive padding or bloat.`
    : `BATCH SIZING:
Generate exactly ${Math.min(10, Math.max(1, count))} practice problems.`

  return `You are a world-class cognitive learning scientist, university professor, and master psychometrician specializing in Automated Item Generation (AIG) and Constraint-Based Item Generation (CBIT).

Your mission is to autonomously engineer high-transfer, authentic practice problems tailored to the student's curriculum and cognitive state.

SCOPE & HIERARCHY:
${contextLines}

${materialSection}
${exemplarSection}
${ckrfSection}

${domainInstructions}

THE 4-LAYER AUTONOMOUS GENERATION ENGINE DIRECTIVES:
1. LAYER 1: CURRICULUM GROUNDING & NO TRIVIAL RECALL
   - Every problem must test functional application, procedural fluency, or theoretical mechanism analysis (Webb's Depth of Knowledge Level 2 or 3).
   - Never ask simple verbatim flashcard recall (e.g., "What is the definition of X?").
   - Frame authentic, novel, realistic scenarios and vignettes. Never refer to "the text", "the slide", or "the handout".

2. LAYER 2: BLUEPRINT HARMONIZATION
   - Mirror the pedagogical rigor, notation style, and problem-solving depth of the provided exemplars (if present).
   - If exemplars are multi-part or multi-tier, incorporate similar structural richness.

3. LAYER 3: CONSTRAINT-BASED PARAMETER CLAMPING (CBIT)
   - For quantitative problems: Calibrate all coefficients, dimensions, and initial parameters so that the intermediate calculations and final answers resolve to clean, elegant numbers (integers or simple fractions/decimals like 2.5, 0.25, 4/3). Do NOT produce messy, accidental irrational values unless specifically testing numerical approximations.
   - For qualitative/conceptual problems: Ensure that distinction boundaries are crisp and free of ambiguous interpretations.

4. LAYER 4: BACKWARD VERIFICATION PASS
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
      "problem_text": "Complete self-contained problem statement using LaTeX for all formulas and variables.",
      "solution_steps": "Flawless step-by-step derivation showing intermediate milestones and reasoning.",
      "final_answer": "Concise verified final answer with units or diagnostic conclusion.",
      "difficulty": 3,
      "principles": ["Principle 1", "Core Formula/Mechanism"],
      "suggested_topic": "${topicTitle || moduleTitle || subjectName}",
      "pedagogical_target": "Specific skill, concept boundary, or misconception tested"
    }
  ]
}`
}
