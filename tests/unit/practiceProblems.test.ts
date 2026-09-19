import {
  buildExtractPracticeProblemsPrompt,
  buildSlideDeckPracticeExtractionPrompt,
  buildTextbookPracticeExtractionPrompt,
  buildTranscriptPracticeExtractionPrompt,
  buildGenerateVariantPrompt,
  buildEvaluatePracticeAttemptPrompt,
  buildAutonomousPracticeProblemPrompt,
  getDomainArchetypeInstructions
} from "../../src/lib/practicePrompts"
import {
  passesCoverTest,
  detectClangAssociations,
  evaluateOptionHomogeneity,
  detectExtremeDeterminers,
  detectCompoundChoices,
  detectNegativeStem,
  classifyDistractorStrategy,
  evaluatePracticeProblemQuality
} from "../../src/lib/practiceValidator"
import { DB_SCHEMA, MIGRATIONS_SQL, deleteSubjectCascade } from "../../src/lib/db"
import type { PracticeProblem, ExtractedPracticeProblem } from "../../src/types"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => any }

describe("Psychometric Item Writing Standards & Validator", () => {
  it("passesCoverTest identifies focused stems and rejects open-concept fragments", () => {
    // Valid stems
    expect(passesCoverTest("What is the derivative of $f(x) = x^3 \\ln(x)$ with respect to $x$?").passed).toBe(true)
    expect(passesCoverTest("Calculate the price elasticity of demand when price rises from \\$10 to \\$12.").passed).toBe(true)
    expect(passesCoverTest("A 45-year-old patient presents with acute chest pain radiating to the jaw. What is the most appropriate initial diagnostic test?").passed).toBe(true)

    // Prohibited open-concept stems that fail the Cover Test
    expect(passesCoverTest("Which of the following is true regarding mitochondria?").passed).toBe(false)
    expect(passesCoverTest("Which of the following statements is correct concerning the IS-LM model?").passed).toBe(false)
    expect(passesCoverTest("All of the following are true EXCEPT:").passed).toBe(false)
    expect(passesCoverTest("Select the correct statement regarding DNA replication.").passed).toBe(false)
  })

  it("detectClangAssociations flags stem keywords appearing exclusively in the correct answer", () => {
    const stem = "What is the primary role of phosphofructokinase in glycolytic flux regulation?"
    const correctKeyWithClang = "It regulates glycolytic flux by catalyzing the irreversible phosphorylation of fructose-6-phosphate."
    const distractor1 = "It hydrolyzes glucose into pyruvate."
    const distractor2 = "It transports ATP into the mitochondrial matrix."

    const result = detectClangAssociations(stem, correctKeyWithClang, [distractor1, distractor2])
    expect(result.hasClang).toBe(true)
    expect(result.matchedTerms).toContain("glycolytic")
    expect(result.matchedTerms).toContain("flux")

    // Clean options with balanced terms
    const cleanKey = "It catalyzes the rate-limiting phosphorylation of fructose-6-phosphate."
    const cleanDistractor1 = "It converts glucose-6-phosphate to fructose-6-phosphate."
    const cleanDistractor2 = "It cleaves fructose-1,6-bisphosphate into triose phosphates."
    const cleanResult = detectClangAssociations(stem, cleanKey, [cleanDistractor1, cleanDistractor2])
    expect(cleanResult.hasClang).toBe(false)
  })

  it("evaluateOptionHomogeneity detects visual length and detail bias in options", () => {
    // Biased options (key is 3x longer and highly descriptive)
    const biasedOptions = {
      A: "Option A is short.",
      B: "The primary consequence is a rapid elevation of cytosolic calcium ions, which subsequently triggers the calmodulin-dependent phosphorylation cascade resulting in smooth muscle contraction.",
      C: "Option C is brief.",
      D: "Option D is simple."
    }
    const biasCheck = evaluateOptionHomogeneity(biasedOptions, 'B')
    expect(biasCheck.isHomogeneous).toBe(false)
    expect(biasCheck.lengthRatio).toBeGreaterThan(1.8)

    // Homogeneous options
    const homogeneousOptions = {
      A: "Increases systemic vascular resistance",
      B: "Decreases pulmonary capillary wedge pressure",
      C: "Increases left ventricular end-diastolic volume",
      D: "Decreases myocardial oxygen consumption"
    }
    const homoCheck = evaluateOptionHomogeneity(homogeneousOptions, 'A')
    expect(homoCheck.isHomogeneous).toBe(true)
  })

  it("detectExtremeDeterminers catches absolute qualifiers in options", () => {
    expect(detectExtremeDeterminers("The system will always maintain constant temperature.").hasExtreme).toBe(true)
    expect(detectExtremeDeterminers("Under no circumstances can kinetic energy exceed potential energy.").hasExtreme).toBe(true)
    expect(detectExtremeDeterminers("It increases when temperature rises under standard pressure.").hasExtreme).toBe(false)
  })

  it("detectCompoundChoices prohibits All of the above and Type K clusters", () => {
    expect(detectCompoundChoices({ A: "Option 1", B: "Option 2", C: "All of the above" }).hasCompound).toBe(true)
    expect(detectCompoundChoices({ A: "Option 1", B: "Option 2", C: "None of these" }).hasCompound).toBe(true)
    expect(detectCompoundChoices({ A: "Option 1", B: "Option 2", C: "Both A and B" }).hasCompound).toBe(true)
    expect(detectCompoundChoices({ A: "Option 1", B: "Option 2", C: "A and C" }).hasCompound).toBe(true)
    expect(detectCompoundChoices({ A: "Option 1", B: "Option 2", C: "Option 3" }).hasCompound).toBe(false)
  })

  it("detectNegativeStem flags unprompted NOT and EXCEPT phrasing", () => {
    expect(detectNegativeStem("Which factor does NOT affect equilibrium price?").isNegative).toBe(true)
    expect(detectNegativeStem("All of the following molecules are neurotransmitters EXCEPT:").isNegative).toBe(true)
    expect(detectNegativeStem("What is the effect of shifting supply outward?").isNegative).toBe(false)
  })

  it("classifyDistractorStrategy maps distractor errors to cognitive failure archetypes", () => {
    expect(classifyDistractorStrategy("-4.5 m/s^2", "Inverted vector direction")).toBe("sign_inversion")
    expect(classifyDistractorStrategy("$100", "Result before dividing by interest rate in preliminary step")).toBe("intermediate_step")
    expect(classifyDistractorStrategy("Afferent arteriole", "Conflated with efferent arteriole due to phonetic similarity")).toBe("nominal_conflation")
    expect(classifyDistractorStrategy("Valid in all domains", "Applied principle outside its boundary assumptions")).toBe("boundary_overextension")
    expect(classifyDistractorStrategy("Condition Y causes factor X", "Inverted causal chain (post hoc fallacy)")).toBe("causal_reversal")
  })

  it("evaluatePracticeProblemQuality generates a comprehensive psychometric scorecard", () => {
    const highQualityProblem: ExtractedPracticeProblem = {
      title: "Cardiac Output and Afterload Vignette",
      problem_text: "A 62-year-old male with chronic hypertension undergoes cardiac catheterization. If systemic vascular resistance increases by 30% while heart rate and contractility remain constant, what is the expected acute directional change in stroke volume and end-systolic volume?",
      stem_lead_in: "What is the expected acute directional change in stroke volume and end-systolic volume?",
      options: {
        A: "Decreased stroke volume; increased end-systolic volume",
        B: "Increased stroke volume; decreased end-systolic volume",
        C: "Decreased stroke volume; decreased end-systolic volume",
        D: "Increased stroke volume; increased end-systolic volume"
      },
      correct_key: "A",
      solution_steps: "1. Afterload is proportional to systemic vascular resistance.\n2. Increased afterload increases impedance to ventricular ejection, decreasing stroke volume.\n3. Decreased ejection volume leaves higher residual blood in the ventricle at the end of systole, increasing end-systolic volume.",
      final_answer: "Stroke volume decreases; end-systolic volume increases (Option A)",
      difficulty: 3,
      principles: ["Afterload", "Stroke Volume", "End-Systolic Volume"],
      item_validation: {
        cover_test_rationale: "Physiological relationship can be deduced without options.",
        key_explanation: "Increased afterload impedes ejection.",
        distractor_analysis: {
          distractor_1: { option: "Option B", misconception_exposed: "Sign inversion of afterload effect", distractor_strategy: "sign_inversion" },
          distractor_2: { option: "Option C", misconception_exposed: "Failure to account for residual volume", distractor_strategy: "boundary_overextension" },
          distractor_3: { option: "Option D", misconception_exposed: "Conflating preload and afterload", distractor_strategy: "nominal_conflation" }
        }
      }
    }

    const evaluation = evaluatePracticeProblemQuality(highQualityProblem)
    expect(evaluation.valid).toBe(true)
    expect(evaluation.quality_score).toBeGreaterThanOrEqual(0.85)
    expect(evaluation.cover_test_passed).toBe(true)
    expect(evaluation.iwfs_detected).toHaveLength(0)
  })
})

describe("Practice Problems Prompts & Cross-Discipline Paradigms", () => {
  const sampleProblem: PracticeProblem = {
    id: 1,
    subject_id: 10,
    module_id: 2,
    topic_id: 3,
    title: "Consumer Equilibrium with Cobb-Douglas Utility",
    problem_text: "Find the optimal consumption bundle for $U(x,y) = x^{0.5} y^{0.5}$ given $P_x = 2, P_y = 4, I = 100$.",
    solution_steps: "1. Setup Lagrangian $L = x^{0.5} y^{0.5} + \\lambda(100 - 2x - 4y)$...\n2. FOC: $0.5 x^{-0.5} y^{0.5} = 2\\lambda$, etc.",
    final_answer: "$x^* = 25, y^* = 12.5$",
    difficulty: 3,
    principles_json: JSON.stringify(["Cobb-Douglas", "Lagrangian", "MRS = Price Ratio"]),
    is_ai_generated: 0,
    created_at: "2026-01-01"
  }

  it("builds an extraction prompt containing NBME Cover Test, Haladyna standards, and LaTeX rules", () => {
    const prompt = buildExtractPracticeProblemsPrompt(
      "Midterm Exam: Problem 1: Calculate the elasticity of demand...",
      "Microeconomics",
      "Module 2: Elasticity",
      "Price Elasticity"
    )

    expect(prompt).toContain("Microeconomics")
    expect(prompt).toContain("Module 2: Elasticity")
    expect(prompt).toContain("Price Elasticity")
    expect(prompt).toContain("Cover Test")
    expect(prompt).toContain("Eliminate Test-Wiseness")
    expect(prompt).toContain("Distractor Quality")
    expect(prompt).toContain("LaTeX")
    expect(prompt).toContain("distractor_analysis")
  })

  it("builds modality-specific extraction prompts for slides, textbooks, and transcripts", () => {
    const slidePrompt = buildSlideDeckPracticeExtractionPrompt("Slide 1: Fiscal Multiplier...", "Macroeconomics")
    expect(slidePrompt).toContain("SOURCE MODALITY TRANSFORMATION: SLIDE PRESENTATIONS")
    expect(slidePrompt).toContain("unstated causal links")

    const textbookPrompt = buildTextbookPracticeExtractionPrompt("Chapter 4: Cell Division...", "Biology")
    expect(textbookPrompt).toContain("SOURCE MODALITY TRANSFORMATION: TEXTBOOKS (BOTTOM-UP INVERSION)")
    expect(textbookPrompt).toContain("Invert this structure")

    const transcriptPrompt = buildTranscriptPracticeExtractionPrompt("Professor: Okay so remember this trap on the exam...", "Physics")
    expect(transcriptPrompt).toContain("SOURCE MODALITY TRANSFORMATION: LECTURE TRANSCRIPTS")
    expect(transcriptPrompt).toContain("Harvest Lecturer Warnings")
  })

  it("incorporates discipline-specific paradigms (STEM variation, TDQ bridging, HATs, Logic)", () => {
    const stemInstructions = getDomainArchetypeInstructions('formal_deductive')
    expect(stemInstructions).toContain("Marton's Variation Theory")
    expect(stemInstructions).toContain("Catrambone's Subgoal Labeling")
    expect(stemInstructions).toContain("Bug-Hunter Error Audits")

    const humanitiesInstructions = getDomainArchetypeInstructions('interpretive_humanities')
    expect(humanitiesInstructions).toContain("TDQ Progressions")
    expect(humanitiesInstructions).toContain("Bridging Connections")

    const socialInstructions = getDomainArchetypeInstructions('social_behavioral')
    expect(socialInstructions).toContain("Two-Tier Diagnostic Vignettes")
  })

  it("builds an isomorphic variant prompt preserving principles and altering numbers with CBIT rules", () => {
    const variantPrompt = buildGenerateVariantPrompt(
      sampleProblem,
      "Student forgot to divide exponents when computing MRS"
    )

    expect(variantPrompt).toContain("Consumer Equilibrium with Cobb-Douglas Utility")
    expect(variantPrompt).toContain("ISOMORPHIC")
    expect(variantPrompt).toContain("CBIT")
    expect(variantPrompt).toContain("Cobb-Douglas")
    expect(variantPrompt).toContain("Clean Parameter Clamping")
    expect(variantPrompt).toContain("Backward Verification Pass")
    expect(variantPrompt).toContain("STUDENT'S PREVIOUS STRUGGLE")
    expect(variantPrompt).toContain("Subgoal Invariance")
  })

  it("builds an evaluation prompt for grading student solutions with error taxonomy", () => {
    const evalPrompt = buildEvaluatePracticeAttemptPrompt(
      sampleProblem,
      "I set MRS = 2/4 = 0.5. Since MRS = y/x, y/x = 0.5, so x = 2y. Then 2(2y) + 4y = 100, 8y = 100, y = 12.5, x = 25."
    )

    expect(evalPrompt).toContain("Socratic tutor")
    expect(evalPrompt).toContain("TARGET FINAL ANSWER")
    expect(evalPrompt).toContain("STUDENT'S SUBMITTED WORK")
    expect(evalPrompt).toContain("error_type")
    expect(evalPrompt).toContain("execution_slip")
    expect(evalPrompt).toContain("conceptual_misconception")
    expect(evalPrompt).toContain("pedagogical_remedy")
  })

  it("builds an autonomous practice generation prompt with AI Decides autoCount", () => {
    const prompt = buildAutonomousPracticeProblemPrompt({
      subjectName: "Microeconomics",
      moduleTitle: "Consumer Theory",
      topicTitle: "Utility Maximization",
      materialsText: "Lecture 4 Notes: Budget constraints, indifference curves, Cobb-Douglas optimization...",
      exemplarProblems: [sampleProblem],
      ckrfContext: "ACTIVE MISCONCEPTIONS:\n- Confuses Marginal Utility with Total Utility\n- Fails to invert fraction when calculating MRS",
      autoCount: true,
      difficultyFocus: "remediate_struggles"
    })

    expect(prompt).toContain("Microeconomics")
    expect(prompt).toContain("Consumer Theory")
    expect(prompt).toContain("Utility Maximization")
    expect(prompt).toContain("AI DECIDES")
    expect(prompt).toContain("CURRICULUM SOURCE MATERIALS")
    expect(prompt).toContain("Lecture 4 Notes")
    expect(prompt).toContain("EXEMPLAR PRACTICE PROBLEMS")
    expect(prompt).toContain("Consumer Equilibrium with Cobb-Douglas Utility")
    expect(prompt).toContain("STUDENT'S ACTIVE LEARNING PROFILE")
    expect(prompt).toContain("Confuses Marginal Utility with Total Utility")
    expect(prompt).toContain("TARGETED REMEDIATION DIRECTIVE")
    expect(prompt).toContain("CONSTRAINT-BASED PARAMETER CLAMPING")
    expect(prompt).toContain("BACKWARD VERIFICATION PASS")
    expect(prompt).toContain("HALADYNA & NBME STANDARDS")
  })
})

describe("Practice Problems DB Schema & Cascades", () => {
  function createTestDb(): any {
    const db = new DatabaseSync(":memory:")
    db.exec("PRAGMA foreign_keys = ON")

    const statements = DB_SCHEMA.split(";").map((s) => s.trim()).filter((s) => s.length > 0)
    for (const stmt of statements) {
      db.exec(stmt + ";")
    }

    for (const migration of MIGRATIONS_SQL) {
      try { db.exec(migration) } catch {}
    }

    return db
  }

  function insert(db: any, sql: string, ...params: unknown[]): number {
    const result = db.prepare(sql).run(...params)
    return Number(result.lastInsertRowid)
  }

  it("creates practice problems with psychometric columns, sessions, attempts and cascades cleanly on subject delete", () => {
    const db = createTestDb()

    const userId = insert(db, "INSERT INTO users (name) VALUES (?)", "Student A")
    const subjectId = insert(db, "INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)", userId, "Macroeconomics", "active")
    const modId = insert(db, "INSERT INTO syllabus_modules (subject_id, title) VALUES (?, ?)", subjectId, "IS-LM Model")
    const topId = insert(db, "INSERT INTO module_topics (module_id, title) VALUES (?, ?)", modId, "Goods Market Equilibrium")

    // Insert practice problem with psychometric fields
    const probId = insert(
      db,
      `INSERT INTO practice_problems (
        subject_id, module_id, topic_id, title, problem_text, difficulty,
        stimulus, stem_lead_in, options_json, correct_key, blooms_revised, webbs_dok,
        discipline_paradigm, quality_score, cover_test_passed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      subjectId, modId, topId, "Derive IS Curve", "Given $C = 100 + 0.8(Y - T)$, $I = 200 - 1000r$, derive IS curve.", 3,
      "Closed economy goods market scenario", "What is the equilibrium equation for the IS curve?",
      JSON.stringify({ A: "$Y = 1500 - 5000r$", B: "$Y = 1000 - 2000r$" }), "A", "Apply", "DOK2",
      "stem_variation", 0.95, 1
    )

    // Insert practice session
    const sessId = insert(
      db,
      "INSERT INTO practice_sessions (subject_id, user_id, module_id, topic_id, total_problems) VALUES (?, ?, ?, ?, ?)",
      subjectId, userId, modId, topId, 1
    )

    // Insert attempt
    insert(
      db,
      "INSERT INTO practice_problem_attempts (session_id, problem_id, user_answer, is_correct, time_spent_seconds) VALUES (?, ?, ?, ?, ?)",
      sessId, probId, "$Y = 1500 - 5000r$", 1, 45
    )

    // Check records exist
    const probRow = db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(probId)
    expect(probRow.title).toBe("Derive IS Curve")
    expect(probRow.blooms_revised).toBe("Apply")
    expect(probRow.webbs_dok).toBe("DOK2")
    expect(probRow.cover_test_passed).toBe(1)
    expect(probRow.quality_score).toBe(0.95)

    expect(db.prepare("SELECT COUNT(*) AS c FROM practice_problems WHERE subject_id = ?").get(subjectId).c).toBe(1)
    expect(db.prepare("SELECT COUNT(*) AS c FROM practice_sessions WHERE subject_id = ?").get(subjectId).c).toBe(1)
    expect(db.prepare("SELECT COUNT(*) AS c FROM practice_problem_attempts WHERE session_id = ?").get(sessId).c).toBe(1)

    // Delete subject cascade
    deleteSubjectCascade(db, subjectId)

    // Verify cascaded deletion
    expect(db.prepare("SELECT COUNT(*) AS c FROM subjects WHERE id = ?").get(subjectId).c).toBe(0)
    expect(db.prepare("SELECT COUNT(*) AS c FROM practice_problems WHERE subject_id = ?").get(subjectId).c).toBe(0)
    expect(db.prepare("SELECT COUNT(*) AS c FROM practice_sessions WHERE subject_id = ?").get(subjectId).c).toBe(0)
    expect(db.prepare("SELECT COUNT(*) AS c FROM practice_problem_attempts WHERE session_id = ?").get(sessId).c).toBe(0)

    db.close()
  })
})
