import {
  buildExtractPracticeProblemsPrompt,
  buildGenerateVariantPrompt,
  buildEvaluatePracticeAttemptPrompt,
  buildAutonomousPracticeProblemPrompt
} from "../../src/lib/practicePrompts"
import { DB_SCHEMA, MIGRATIONS_SQL, deleteSubjectCascade } from "../../src/lib/db"
import type { PracticeProblem } from "../../src/types"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => any }

describe("Practice Problems Prompts", () => {
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

  it("builds an extraction prompt containing subject, module, and LaTeX rules", () => {
    const prompt = buildExtractPracticeProblemsPrompt(
      "Midterm Exam: Problem 1: Calculate the elasticity of demand...",
      "Microeconomics",
      "Module 2: Elasticity",
      "Price Elasticity"
    )

    expect(prompt).toContain("Microeconomics")
    expect(prompt).toContain("Module 2: Elasticity")
    expect(prompt).toContain("Price Elasticity")
    expect(prompt).toContain("LaTeX notation")
    expect(prompt).toContain("schema")
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
  })

  it("builds an autonomous practice prompt with fixed count and no prior exemplars", () => {
    const prompt = buildAutonomousPracticeProblemPrompt({
      subjectName: "Organic Chemistry",
      moduleTitle: "Electrophilic Addition",
      topicTitle: "Markovnikov's Rule",
      count: 5,
      autoCount: false,
      difficultyFocus: "challenge"
    })

    expect(prompt).toContain("Organic Chemistry")
    expect(prompt).toContain("Markovnikov's Rule")
    expect(prompt).toContain("Generate exactly 5 practice problems")
    expect(prompt).toContain("CHALLENGE")
    expect(prompt).toContain("BACKWARD VERIFICATION PASS")
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

  it("creates practice problems, sessions, attempts and cascades cleanly on subject delete", () => {
    const db = createTestDb()

    const userId = insert(db, "INSERT INTO users (name) VALUES (?)", "Student A")
    const subjectId = insert(db, "INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)", userId, "Macroeconomics", "active")
    const modId = insert(db, "INSERT INTO syllabus_modules (subject_id, title) VALUES (?, ?)", subjectId, "IS-LM Model")
    const topId = insert(db, "INSERT INTO module_topics (module_id, title) VALUES (?, ?)", modId, "Goods Market Equilibrium")

    // Insert practice problem
    const probId = insert(
      db,
      "INSERT INTO practice_problems (subject_id, module_id, topic_id, title, problem_text, difficulty) VALUES (?, ?, ?, ?, ?, ?)",
      subjectId, modId, topId, "Derive IS Curve", "Given $C = 100 + 0.8(Y - T)$, $I = 200 - 1000r$, derive IS curve.", 3
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
