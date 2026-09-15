import type { PracticeProblem } from "../types"

/**
 * Build prompt for extracting practice problems from uploaded document text / slides / notes
 * Enforces deep structural extraction, clean LaTeX formatting, and step-by-step verified derivations.
 */
export function buildExtractPracticeProblemsPrompt(
  text: string,
  subjectName: string,
  moduleTitle?: string,
  topicTitle?: string
): string {
  const context = [
    `Subject: ${subjectName}`,
    moduleTitle ? `Module: ${moduleTitle}` : null,
    topicTitle ? `Topic: ${topicTitle}` : null,
  ].filter(Boolean).join("\n")

  return `You are an expert STEM and Economics professor and educational measurement specialist.
Your task is to extract individual practice problems, exercises, mathematical questions, and analytical problem-set questions from the following source text.

${context}

SOURCE TEXT:
"""
${text.slice(0, 15000)}
"""

CRITICAL PEDAGOGICAL & MATHEMATICAL REQUIREMENTS:
1. Identify all distinct practice problems, sample exam questions, calculations, or word problems.
2. Format all mathematical expressions, equations, and variables with standard LaTeX notation ($...$ for inline, $$...$$ for display equations).
3. If the source text provides step-by-step solutions, extract them cleanly. If not, solve the problem with rigorous step-by-step mathematical/analytical derivation.
4. Extract the deep structural principles, governing equations, and formulas required (e.g., ["Cobb-Douglas Utility", "Lagrangian Optimization", "Marginal Rate of Substitution"]).
5. Estimate cognitive difficulty on a scale from 1 (direct calculation) to 5 (advanced multi-step synthesis).
6. CRITICAL NOTEBOOKLM GROUNDING RULE (ZERO HALLUCINATIONS): Extract problems, principles, and step-by-step solutions STRICTLY and EXCLUSIVELY from the SOURCE TEXT. Do NOT invent problems, topics, or formulas that are not directly present or grounded in the source text.

Output ONLY a valid JSON object matching this schema (no markdown preamble, no comments):
{
  "problems": [
    {
      "title": "Short descriptive title of problem",
      "problem_text": "Full problem prompt with numbers and clear instructions using LaTeX ($x^2$, $\\\\frac{a}{b}$).",
      "solution_steps": "Detailed step-by-step analytical derivation showing intermediate landmark steps.",
      "final_answer": "Concise final answer with exact units (e.g. $x^* = 10, y^* = 25$).",
      "difficulty": 3,
      "principles": ["Principle 1", "Formula 2"],
      "suggested_topic": "Topic Name"
    }
  ]
}`
}

/**
 * Build prompt to generate a new isomorphic variant of a practice problem using the CBIT (Computational Blueprint for Isomorphic Twins) Framework.
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

  return `You are an expert STEM and Economics professor specializing in Automated Item Generation (AIG) and Cognitive Load Theory.
Generate a brand new practice problem that is mathematically and structurally ISOMORPHIC to the base problem below using the Computational Blueprint for Isomorphic Twins (CBIT) framework.

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

THE 4-LAYER ISOMORPHIC BLUEPRINT RULES (CBIT):
1. LAYER 1 (Structural Invariance): Keep the exact underlying mathematical model, governing equations, first-order conditions (FOC), and theoretical principles unchanged.
2. LAYER 2 (Clean Parameter Clamping): Sample parameter values such that all calculations resolve to CLEAN INTEGERS, SIMPLE FRACTIONS, or terminating decimals (e.g., $Q^* = 15$, $P^* = 40$, $k = 2.5$). Avoid infinite repeating decimals or unwieldy fractions that create unnecessary extraneous cognitive load.
3. LAYER 3 (Narrative & Domain Variation): Change the real-world scenario, entity names, or industrial/physical context to test deep conceptual transfer rather than rote number replacement.
4. LAYER 4 (Backward Verification Pass): Verify that the final answer satisfies all initial equations and feasibility constraints (e.g., prices $> 0$, quantities $> 0$, discriminant $\\ge 0$). Format all math in LaTeX ($...$ and $$...$$).
5. CRITICAL GROUNDING (ZERO HALLUCINATIONS): The variant must strictly remain within the scope and principles demonstrated in the BASE PROBLEM. Do not introduce extraneous formulas, theories, or concepts outside the base problem.

Output ONLY a valid JSON object matching this schema:
{
  "title": "Variant: Descriptive Title",
  "problem_text": "New problem prompt with newly calibrated parameters and clear instructions using LaTeX.",
  "solution_steps": "Flawless step-by-step derivation for this new problem.",
  "final_answer": "Verified final concise answer with units.",
  "difficulty": ${baseProblem.difficulty},
  "principles": ${JSON.stringify(principles)}
}
`
}

/**
 * Build prompt for evaluating a student's attempt on a practice problem with Diagnostic Error Taxonomy.
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
1. Determine mathematical and conceptual validity (is_correct: true/false). Allow for algebraically equivalent forms (e.g. $1/2$ vs $0.5$) unless a specific representation was requested.
2. Classify the error into one of the following precise pedagogical categories (error_type):
   - "correct": The derivation and final result are sound.
   - "execution_slip": The conceptual setup/formulas were completely correct, but a minor arithmetic or algebraic calculation slip occurred.
   - "conceptual_misconception": Applied the wrong fundamental principle, incorrect theorem, or flawed equation setup (e.g., set $P = MC$ instead of $MR = MC$).
   - "boundary_condition_error": Overlooked domain limits, feasibility constraints, or sign conventions.
   - "unit_mismatch": Failed to convert or match physical/economic units.
   - "other": Incomplete work or unrelated input.
3. Provide targeted, encouraging Socratic feedback. If there is an error, provide a "pedagogical_remedy" hint that guides them toward the correct step without immediately spoiling the final answer.
4. Format all equations and mathematical variables with LaTeX ($...$).
5. CRITICAL GROUNDING: Base your evaluation, step analysis, and feedback strictly and exclusively on the PROBLEM STATEMENT and REFERENCE SOLUTION. Do not introduce outside principles or penalize the student based on extraneous requirements.

Output ONLY a valid JSON object matching this schema:
{
  "is_correct": true,
  "error_type": "correct",
  "feedback": "Detailed, encouraging feedback reviewing their derivation.",
  "pedagogical_remedy": "Socratic guidance question or hint for their specific error type.",
  "step_analysis": ["Step 1: Correctly set up the Lagrangian", "Step 2: Arithmetic slip when dividing 180 by 4"],
  "identified_errors": ["Arithmetic slip on step 2"],
  "key_principles": ["Budget constraint substitution", "First Order Conditions"],
  "suggested_next_action": "continue"
}`
}

