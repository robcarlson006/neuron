import { ipcMain } from "electron"
import Database from "better-sqlite3"
import { callAIMessages } from "./aiHandlers"
import { resolveAIConfig } from "./aiConfigStore"
import {
  buildExtractPracticeProblemsPrompt,
  buildGenerateVariantPrompt,
  buildEvaluatePracticeAttemptPrompt,
  buildAutonomousPracticeProblemPrompt
} from "../../src/lib/practicePrompts"
import { evaluatePracticeProblemQuality } from "../../src/lib/practiceValidator"
import { parseDocumentTopology } from "../../src/lib/coverage/documentTopologyParser"
import { classifyMaterialDomain } from "../../src/lib/classification/domainClassifier"
import { cleanMarkdownFences, safeParseAIJson } from "../../src/lib/jsonRepair"
import {
  recordTopicAssessment,
  recordMisconception,
  recordConceptSuccess,
  buildCKRFMemoryBlock
} from "../../src/lib/memory/ckrfMemoryService"
import type {
  PracticeProblem,
  PracticeSession,
  PracticeProblemAttempt,
  PracticeSessionConfig,
  PracticeEvaluationResult,
  ExtractedPracticeProblem,
  AutonomousPracticeGenOptions,
  AutonomousPracticeGenResult
} from "../../src/types"

let db: Database.Database

export function setPracticeDatabase(database: Database.Database): void {
  db = database
}

function detectModality(filename?: string, content?: string): 'slides' | 'textbook' | 'transcript' | 'general' {
  const lowerName = (filename || '').toLowerCase()
  const lowerContent = (content || '').toLowerCase()
  if (lowerName.includes('slide') || lowerName.includes('presentation') || lowerName.includes('deck') || lowerName.endsWith('.pptx')) {
    return 'slides'
  }
  if (lowerName.includes('transcript') || lowerName.includes('lecture') || lowerName.includes('audio') || lowerName.endsWith('.vtt') || lowerName.endsWith('.srt') || lowerContent.includes('[00:') || lowerContent.includes('timestamp')) {
    return 'transcript'
  }
  if (lowerName.includes('chapter') || lowerName.includes('textbook') || lowerName.includes('book') || lowerName.includes('ch_') || lowerName.includes('ch0') || lowerName.includes('ch1')) {
    return 'textbook'
  }
  return 'general'
}

async function extractProblemsFromMaterialText(
  text: string,
  subjectName: string,
  filename?: string,
  moduleTitle?: string,
  topicTitle?: string,
  engineOverride?: string
): Promise<ExtractedPracticeProblem[]> {
  const aiConfig = resolveAIConfig(engineOverride)
  if (!aiConfig.apiKey) {
    throw new Error(
      `No API key configured for ${engineOverride || aiConfig.provider}. Please configure your API key in Settings.`
    )
  }

  const domainResult = classifyMaterialDomain(text, subjectName, filename)
  const modality = detectModality(filename, text)

  const chunksToProcess: { text: string; title?: string }[] = []
  if (text.length > 6000) {
    const topology = parseDocumentTopology(text, filename || '', 1200)
    for (const chunk of topology.chunks) {
      if (chunk.text.trim().length > 100) {
        chunksToProcess.push({ text: chunk.text, title: chunk.title })
      }
    }
  }

  if (chunksToProcess.length === 0) {
    chunksToProcess.push({ text, title: filename || 'Source Content' })
  }

  const allProblems: ExtractedPracticeProblem[] = []
  let lastError: Error | null = null

  for (const chunk of chunksToProcess) {
    const prompt = buildExtractPracticeProblemsPrompt(
      chunk.text,
      subjectName,
      moduleTitle ? `${moduleTitle}${chunk.title ? ` - ${chunk.title}` : ''}` : chunk.title,
      topicTitle,
      domainResult,
      modality
    )

    try {
      const responseText = await callAIMessages(
        [{ role: "user", content: prompt }],
        aiConfig,
        { type: "json_object" }
      )

      const parsed = safeParseAIJson<{ problems?: ExtractedPracticeProblem[] }>(responseText, {})
      if (parsed.problems && Array.isArray(parsed.problems) && parsed.problems.length > 0) {
        for (const p of parsed.problems) {
          const quality = evaluatePracticeProblemQuality(p)
          p.quality_score = quality.quality_score
          p.cover_test_passed = quality.cover_test_passed
          p.discipline_paradigm = p.discipline_paradigm || domainResult.primaryArchetype
          allProblems.push(p)
        }
      } else {
        throw new Error("Model returned empty or unparseable problem list.")
      }
    } catch (chunkErr: any) {
      console.warn("Primary model failed for chunk:", chunk.title, chunkErr)
      lastError = chunkErr instanceof Error ? chunkErr : new Error(String(chunkErr))

      // Fallback: If primary model was Gemini and failed, try DeepSeek if key is available, or vice-versa
      try {
        const fallbackProvider = aiConfig.provider === 'gemini' ? 'deepseek' : 'gemini'
        const fallbackConfig = resolveAIConfig(fallbackProvider)
        if (fallbackConfig.apiKey && fallbackConfig.apiKey !== aiConfig.apiKey) {
          console.log(`Attempting fallback extraction using ${fallbackProvider}…`)
          const fallbackText = await callAIMessages(
            [{ role: "user", content: prompt }],
            fallbackConfig,
            { type: "json_object" }
          )
          const fallbackParsed = safeParseAIJson<{ problems?: ExtractedPracticeProblem[] }>(fallbackText, {})
          if (fallbackParsed.problems && Array.isArray(fallbackParsed.problems) && fallbackParsed.problems.length > 0) {
            for (const p of fallbackParsed.problems) {
              const quality = evaluatePracticeProblemQuality(p)
              p.quality_score = quality.quality_score
              p.cover_test_passed = quality.cover_test_passed
              p.discipline_paradigm = p.discipline_paradigm || domainResult.primaryArchetype
              allProblems.push(p)
            }
            lastError = null
          }
        }
      } catch (fallbackErr) {
        console.warn("Fallback model also failed:", fallbackErr)
      }
    }
  }

  if (allProblems.length === 0 && lastError) {
    throw new Error(`Practice problem extraction failed: ${lastError.message}`)
  }

  // Deduplicate extracted problems across chunks
  const seen = new Set<string>()
  const deduplicated: ExtractedPracticeProblem[] = []
  for (const p of allProblems) {
    if (!p || !p.problem_text) continue
    const key = p.problem_text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80)
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(p)
    }
  }

  return deduplicated
}

export function registerPracticeHandlers(): void {
  // ── 1. List Problems ─────────────────────────────────────────────────────
  ipcMain.handle(
    "practice:listProblems",
    (_event, subjectId: number, moduleId?: number, topicId?: number) => {
      try {
        let query = "SELECT * FROM practice_problems WHERE subject_id = ?"
        const params: unknown[] = [subjectId]

        if (topicId) {
          query += " AND topic_id = ?"
          params.push(topicId)
        } else if (moduleId) {
          query += " AND module_id = ?"
          params.push(moduleId)
        }

        query += " ORDER BY id ASC"
        return db.prepare(query).all(...params) as PracticeProblem[]
      } catch (err) {
        console.error("practice:listProblems error:", err)
        return []
      }
    }
  )

  // ── 2. Get Problem ───────────────────────────────────────────────────────
  ipcMain.handle("practice:getProblem", (_event, problemId: number) => {
    try {
      return (db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(problemId) as PracticeProblem) || null
    } catch (err) {
      console.error("practice:getProblem error:", err)
      return null
    }
  })

  // ── 3. Create Problem ────────────────────────────────────────────────────
  ipcMain.handle("practice:createProblem", (_event, problem: Partial<PracticeProblem>) => {
    try {
      const quality = evaluatePracticeProblemQuality(problem as PracticeProblem)
      const stmt = db.prepare(`
        INSERT INTO practice_problems (
          subject_id, module_id, topic_id, material_id,
          title, problem_text, solution_steps, final_answer,
          difficulty, principles_json, is_ai_generated, parent_problem_id,
          stimulus, stem_lead_in, options_json, correct_key,
          blooms_revised, webbs_dok, discipline_paradigm,
          subgoals_json, item_validation_json, quality_score, cover_test_passed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const res = stmt.run(
        problem.subject_id,
        problem.module_id || null,
        problem.topic_id || null,
        problem.material_id || null,
        problem.title || "Practice Problem",
        problem.problem_text || "",
        problem.solution_steps || null,
        problem.final_answer || null,
        problem.difficulty || 2,
        problem.principles_json || "[]",
        problem.is_ai_generated || 0,
        problem.parent_problem_id || null,
        problem.stimulus || null,
        problem.stem_lead_in || null,
        problem.options_json || null,
        problem.correct_key || null,
        problem.blooms_revised || null,
        problem.webbs_dok || null,
        problem.discipline_paradigm || null,
        problem.subgoals_json || null,
        problem.item_validation_json || null,
        problem.quality_score ?? quality.quality_score,
        problem.cover_test_passed !== undefined ? (problem.cover_test_passed ? 1 : 0) : (quality.cover_test_passed ? 1 : 0)
      )
      return db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(res.lastInsertRowid) as PracticeProblem
    } catch (err) {
      console.error("practice:createProblem error:", err)
      throw err
    }
  })

  // ── 4. Delete Problem ────────────────────────────────────────────────────
  ipcMain.handle("practice:deleteProblem", (_event, problemId: number) => {
    try {
      db.prepare("DELETE FROM practice_problems WHERE id = ?").run(problemId)
      return { success: true }
    } catch (err) {
      console.error("practice:deleteProblem error:", err)
      return { success: false, error: String(err) }
    }
  })

  // ── 5. Extract Problems from Material ────────────────────────────────────
  ipcMain.handle(
    "practice:extractFromMaterial",
    async (_event, subjectId: number, materialId: number, moduleId?: number, topicId?: number, engineOverride?: string) => {
      try {
        const material = db.prepare("SELECT * FROM materials WHERE id = ?").get(materialId) as
          | { filename: string; content_text: string }
          | undefined
        if (!material || !material.content_text) {
          throw new Error("Material has no readable text content.")
        }

        const subject = db.prepare("SELECT name FROM subjects WHERE id = ?").get(subjectId) as
          | { name: string }
          | undefined

        let moduleTitle: string | undefined
        if (moduleId) {
          const mod = db.prepare("SELECT title FROM syllabus_modules WHERE id = ?").get(moduleId) as { title: string } | undefined
          moduleTitle = mod?.title
        }

        let topicTitle: string | undefined
        if (topicId) {
          const top = db.prepare("SELECT title FROM module_topics WHERE id = ?").get(topicId) as { title: string } | undefined
          topicTitle = top?.title
        }

        const problems = await extractProblemsFromMaterialText(
          material.content_text,
          subject?.name || "Subject",
          material.filename,
          moduleTitle,
          topicTitle,
          engineOverride
        )

        if (!problems || problems.length === 0) {
          throw new Error("No practice problems could be identified or extracted from this material.")
        }

        const created: PracticeProblem[] = []

        const insertStmt = db.prepare(`
          INSERT INTO practice_problems (
            subject_id, module_id, topic_id, material_id,
            title, problem_text, solution_steps, final_answer,
            difficulty, principles_json, is_ai_generated, parent_problem_id,
            stimulus, stem_lead_in, options_json, correct_key,
            blooms_revised, webbs_dok, discipline_paradigm,
            subgoals_json, item_validation_json, quality_score, cover_test_passed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const p of problems) {
          if (!p.problem_text) continue
          const quality = evaluatePracticeProblemQuality(p)
          const res = insertStmt.run(
            subjectId,
            moduleId || null,
            topicId || null,
            materialId,
            p.title || "Practice Problem",
            p.problem_text,
            p.solution_steps || null,
            p.final_answer || null,
            p.difficulty || 2,
            JSON.stringify(p.principles || []),
            p.stimulus || null,
            p.stem_lead_in || null,
            p.options ? JSON.stringify(p.options) : null,
            p.correct_key || null,
            typeof p.cognitive_level === 'object' ? p.cognitive_level?.blooms_revised : (p.blooms_revised || null),
            typeof p.cognitive_level === 'object' ? p.cognitive_level?.webbs_dok : (p.webbs_dok || null),
            p.discipline_paradigm || null,
            p.subgoals ? JSON.stringify(p.subgoals) : null,
            p.item_validation ? JSON.stringify(p.item_validation) : null,
            p.quality_score ?? quality.quality_score,
            p.cover_test_passed !== undefined ? (p.cover_test_passed ? 1 : 0) : (quality.cover_test_passed ? 1 : 0)
          )
          const row = db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(res.lastInsertRowid) as PracticeProblem
          if (row) created.push(row)
        }

        return { success: true, count: created.length, problems: created }
      } catch (err) {
        console.error("practice:extractFromMaterial error:", err)
        return { success: false, count: 0, error: String(err) }
      }
    }
  )

  // ── 6. Extract Problems from Text ────────────────────────────────────────
  ipcMain.handle(
    "practice:extractFromText",
    async (_event, subjectId: number, text: string, moduleId?: number, topicId?: number, engineOverride?: string) => {
      try {
        if (!text || text.trim().length < 20) {
          throw new Error("Text is too short to extract practice problems.")
        }

        const subject = db.prepare("SELECT name FROM subjects WHERE id = ?").get(subjectId) as
          | { name: string }
          | undefined

        let moduleTitle: string | undefined
        if (moduleId) {
          const mod = db.prepare("SELECT title FROM syllabus_modules WHERE id = ?").get(moduleId) as { title: string } | undefined
          moduleTitle = mod?.title
        }

        let topicTitle: string | undefined
        if (topicId) {
          const top = db.prepare("SELECT title FROM module_topics WHERE id = ?").get(topicId) as { title: string } | undefined
          topicTitle = top?.title
        }

        const problems = await extractProblemsFromMaterialText(
          text,
          subject?.name || "Subject",
          undefined,
          moduleTitle,
          topicTitle,
          engineOverride
        )

        if (!problems || problems.length === 0) {
          throw new Error("No practice problems could be identified or extracted from this text.")
        }

        const created: PracticeProblem[] = []

        const insertStmt = db.prepare(`
          INSERT INTO practice_problems (
            subject_id, module_id, topic_id,
            title, problem_text, solution_steps, final_answer,
            difficulty, principles_json, is_ai_generated, parent_problem_id,
            stimulus, stem_lead_in, options_json, correct_key,
            blooms_revised, webbs_dok, discipline_paradigm,
            subgoals_json, item_validation_json, quality_score, cover_test_passed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const p of problems) {
          if (!p.problem_text) continue
          const quality = evaluatePracticeProblemQuality(p)
          const res = insertStmt.run(
            subjectId,
            moduleId || null,
            topicId || null,
            p.title || "Practice Problem",
            p.problem_text,
            p.solution_steps || null,
            p.final_answer || null,
            p.difficulty || 2,
            JSON.stringify(p.principles || []),
            p.stimulus || null,
            p.stem_lead_in || null,
            p.options ? JSON.stringify(p.options) : null,
            p.correct_key || null,
            typeof p.cognitive_level === 'object' ? p.cognitive_level?.blooms_revised : (p.blooms_revised || null),
            typeof p.cognitive_level === 'object' ? p.cognitive_level?.webbs_dok : (p.webbs_dok || null),
            p.discipline_paradigm || null,
            p.subgoals ? JSON.stringify(p.subgoals) : null,
            p.item_validation ? JSON.stringify(p.item_validation) : null,
            p.quality_score ?? quality.quality_score,
            p.cover_test_passed !== undefined ? (p.cover_test_passed ? 1 : 0) : (quality.cover_test_passed ? 1 : 0)
          )
          const row = db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(res.lastInsertRowid) as PracticeProblem
          if (row) created.push(row)
        }

        return { success: true, count: created.length, problems: created }
      } catch (err) {
        console.error("practice:extractFromText error:", err)
        return { success: false, count: 0, error: String(err) }
      }
    }
  )

  // ── 7. Generate Isomorphic Variant ───────────────────────────────────────
  ipcMain.handle(
    "practice:generateVariant",
    async (_event, problemId: number, userStruggles?: string) => {
      try {
        const baseProblem = db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(problemId) as PracticeProblem | undefined
        if (!baseProblem) throw new Error("Base practice problem not found.")

        const prompt = buildGenerateVariantPrompt(baseProblem, userStruggles)

        const aiConfig = resolveAIConfig()
        if (!aiConfig.apiKey) throw new Error("AI API key not configured. Go to Settings to configure your AI provider.")

        const responseText = await callAIMessages(
          [{ role: "user", content: prompt }],
          aiConfig,
          { type: "json_object" }
        )

        const cleanedJson = cleanMarkdownFences(responseText)
        let parsed: ExtractedPracticeProblem
        try {
          parsed = JSON.parse(cleanedJson)
        } catch {
          throw new Error("Failed to parse generated variant JSON.")
        }

        const quality = evaluatePracticeProblemQuality(parsed)

        const stmt = db.prepare(`
          INSERT INTO practice_problems (
            subject_id, module_id, topic_id, material_id,
            title, problem_text, solution_steps, final_answer,
            difficulty, principles_json, is_ai_generated, parent_problem_id,
            stimulus, stem_lead_in, options_json, correct_key,
            blooms_revised, webbs_dok, discipline_paradigm,
            subgoals_json, item_validation_json, quality_score, cover_test_passed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const res = stmt.run(
          baseProblem.subject_id,
          baseProblem.module_id,
          baseProblem.topic_id,
          baseProblem.material_id,
          parsed.title || `Variant: ${baseProblem.title}`,
          parsed.problem_text,
          parsed.solution_steps,
          parsed.final_answer,
          parsed.difficulty || baseProblem.difficulty,
          JSON.stringify(parsed.principles || []),
          baseProblem.id,
          parsed.stimulus || null,
          parsed.stem_lead_in || null,
          parsed.options ? JSON.stringify(parsed.options) : null,
          parsed.correct_key || null,
          parsed.blooms_revised || baseProblem.blooms_revised || 'Apply',
          parsed.webbs_dok || baseProblem.webbs_dok || 'DOK2',
          parsed.discipline_paradigm || baseProblem.discipline_paradigm || null,
          parsed.subgoals ? JSON.stringify(parsed.subgoals) : null,
          parsed.item_validation ? JSON.stringify(parsed.item_validation) : null,
          parsed.quality_score ?? quality.quality_score,
          parsed.cover_test_passed !== undefined ? (parsed.cover_test_passed ? 1 : 0) : (quality.cover_test_passed ? 1 : 0)
        )

        const variant = db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(res.lastInsertRowid) as PracticeProblem
        return { success: true, variant }
      } catch (err) {
        console.error("practice:generateVariant error:", err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── 8. Autonomous Practice Problem Generation ─────────────────────────────
  ipcMain.handle(
    "practice:autonomousGenerate",
    async (_event, options: AutonomousPracticeGenOptions): Promise<AutonomousPracticeGenResult> => {
      try {
        const {
          subjectId,
          userId,
          moduleId,
          topicId,
          materialId,
          count = 4,
          autoCount = false,
          difficultyFocus = 'adaptive',
          customInstructions
        } = options

        const aiConfig = resolveAIConfig()
        if (!aiConfig.apiKey) {
          throw new Error("AI API key not configured. Go to Settings to configure your AI provider.")
        }

        // 1. Get Subject info
        const subject = db.prepare("SELECT name FROM subjects WHERE id = ?").get(subjectId) as
          | { name: string }
          | undefined
        if (!subject) throw new Error("Subject not found.")

        // 2. Get Module and Topic info if provided
        let moduleTitle: string | undefined
        if (moduleId) {
          const mod = db.prepare("SELECT title FROM syllabus_modules WHERE id = ?").get(moduleId) as
            | { title: string }
            | undefined
          moduleTitle = mod?.title
        }

        let topicTitle: string | undefined
        if (topicId) {
          const top = db.prepare("SELECT title FROM module_topics WHERE id = ?").get(topicId) as
            | { title: string }
            | undefined
          topicTitle = top?.title
        }

        // 3. Gather relevant source materials (Curator Layer)
        let materialsText = ""
        let sampledFilename: string | undefined

        if (materialId) {
          const mat = db.prepare("SELECT filename, content_text FROM materials WHERE id = ?").get(materialId) as
            | { filename: string; content_text: string }
            | undefined
          if (mat?.content_text) {
            materialsText = mat.content_text.slice(0, 12000)
            sampledFilename = mat.filename
          }
        } else if (moduleId) {
          // Check materials associated with module
          const mats = db.prepare(
            "SELECT filename, content_text FROM materials WHERE subject_id = ? AND module_id = ? ORDER BY id DESC LIMIT 3"
          ).all(subjectId, moduleId) as { filename: string; content_text: string }[]

          if (mats.length > 0) {
            materialsText = mats.map(m => m.content_text).filter(Boolean).join("\n\n---\n\n").slice(0, 12000)
            sampledFilename = mats[0].filename
          }
        }

        // If still empty, grab any recent materials for this subject
        if (!materialsText) {
          const mats = db.prepare(
            "SELECT filename, content_text FROM materials WHERE subject_id = ? ORDER BY uploaded_at DESC LIMIT 3"
          ).all(subjectId) as { filename: string; content_text: string }[]

          if (mats.length > 0) {
            materialsText = mats.map(m => m.content_text).filter(Boolean).join("\n\n---\n\n").slice(0, 12000)
            sampledFilename = mats[0].filename
          }
        }

        // 4. Gather 1-3 Exemplar Practice Problems (Blueprint Synthesizer Layer)
        let exemplarProblems: PracticeProblem[] = []
        if (topicId) {
          exemplarProblems = db.prepare(
            "SELECT * FROM practice_problems WHERE subject_id = ? AND topic_id = ? ORDER BY is_ai_generated ASC, id DESC LIMIT 3"
          ).all(subjectId, topicId) as PracticeProblem[]
        }
        if (exemplarProblems.length === 0 && moduleId) {
          exemplarProblems = db.prepare(
            "SELECT * FROM practice_problems WHERE subject_id = ? AND module_id = ? ORDER BY is_ai_generated ASC, id DESC LIMIT 3"
          ).all(subjectId, moduleId) as PracticeProblem[]
        }
        if (exemplarProblems.length === 0) {
          exemplarProblems = db.prepare(
            "SELECT * FROM practice_problems WHERE subject_id = ? ORDER BY is_ai_generated ASC, id DESC LIMIT 3"
          ).all(subjectId) as PracticeProblem[]
        }

        // 5. Gather CKRF Diagnostic Memory (Constraint & Misconception Targeting)
        const ckrfContext = buildCKRFMemoryBlock(db, userId, subjectId, topicTitle || moduleTitle)

        // 6. Epistemic Archetype Domain Classification
        const domainResult = classifyMaterialDomain(materialsText || topicTitle || subject.name, subject.name, sampledFilename)

        // 7. Build Autonomous Prompt
        const prompt = buildAutonomousPracticeProblemPrompt({
          subjectName: subject.name,
          moduleTitle,
          topicTitle,
          materialsText,
          exemplarProblems,
          ckrfContext,
          count,
          autoCount,
          difficultyFocus,
          domainResult,
          customInstructions
        })

        // 8. Execute LLM Call
        const responseText = await callAIMessages(
          [{ role: "user", content: prompt }],
          aiConfig,
          { type: "json_object" }
        )

        // 9. Parse and validate JSON
        const cleanedJson = cleanMarkdownFences(responseText)
        let parsed: { rationale?: string; problems?: ExtractedPracticeProblem[] } = {}
        try {
          parsed = JSON.parse(cleanedJson)
        } catch {
          const match = cleanedJson.match(/\{.*"problems"\s*:\s*\[([\s\S]*?)\]\s*\}/)
          if (match) {
            parsed = JSON.parse(match[0])
          } else {
            throw new Error("Failed to parse generated practice problems JSON.")
          }
        }

        if (!parsed.problems || !Array.isArray(parsed.problems) || parsed.problems.length === 0) {
          throw new Error("No practice problems were generated by the model.")
        }

        // 10. Persist to database
        const insertStmt = db.prepare(`
          INSERT INTO practice_problems (
            subject_id, module_id, topic_id, material_id,
            title, problem_text, solution_steps, final_answer,
            difficulty, principles_json, is_ai_generated, parent_problem_id,
            stimulus, stem_lead_in, options_json, correct_key,
            blooms_revised, webbs_dok, discipline_paradigm,
            subgoals_json, item_validation_json, quality_score, cover_test_passed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const created: PracticeProblem[] = []
        const parentExemplarId = exemplarProblems.length > 0 ? exemplarProblems[0].id : null

        for (const p of parsed.problems) {
          if (!p || !p.problem_text) continue
          const quality = evaluatePracticeProblemQuality(p)

          const res = insertStmt.run(
            subjectId,
            moduleId || null,
            topicId || null,
            materialId || null,
            p.title || `${topicTitle || moduleTitle || subject.name} Practice`,
            p.problem_text,
            p.solution_steps || null,
            p.final_answer || null,
            p.difficulty || 3,
            JSON.stringify(p.principles || []),
            parentExemplarId,
            p.stimulus || null,
            p.stem_lead_in || null,
            p.options ? JSON.stringify(p.options) : null,
            p.correct_key || null,
            typeof p.cognitive_level === 'object' ? p.cognitive_level?.blooms_revised : (p.blooms_revised || 'Apply'),
            typeof p.cognitive_level === 'object' ? p.cognitive_level?.webbs_dok : (p.webbs_dok || 'DOK2'),
            p.discipline_paradigm || domainResult.primaryArchetype,
            p.subgoals ? JSON.stringify(p.subgoals) : null,
            p.item_validation ? JSON.stringify(p.item_validation) : null,
            p.quality_score ?? quality.quality_score,
            p.cover_test_passed !== undefined ? (p.cover_test_passed ? 1 : 0) : (quality.cover_test_passed ? 1 : 0)
          )

          const row = db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(res.lastInsertRowid) as PracticeProblem
          if (row) created.push(row)
        }

        return {
          success: true,
          count: created.length,
          problems: created,
          rationale: parsed.rationale
        }
      } catch (err) {
        console.error("practice:autonomousGenerate error:", err)
        return {
          success: false,
          count: 0,
          error: String(err)
        }
      }
    }
  )

  // ── 9. Create Practice Session ───────────────────────────────────────────
  ipcMain.handle("practice:createSession", (_event, config: PracticeSessionConfig) => {
    try {
      // 1. Find candidate problems
      let query = "SELECT * FROM practice_problems WHERE subject_id = ?"
      const params: unknown[] = [config.subjectId]

      if (config.topicId) {
        query += " AND topic_id = ?"
        params.push(config.topicId)
      } else if (config.moduleId) {
        query += " AND module_id = ?"
        params.push(config.moduleId)
      }

      query += " ORDER BY is_ai_generated ASC, RANDOM()"
      const allProblems = db.prepare(query).all(...params) as PracticeProblem[]

      const selectedProblems = config.problemCount && config.problemCount < 999
        ? allProblems.slice(0, config.problemCount)
        : allProblems

      const stmt = db.prepare(`
        INSERT INTO practice_sessions (
          subject_id, user_id, module_id, topic_id, total_problems
        ) VALUES (?, ?, ?, ?, ?)
      `)
      const res = stmt.run(
        config.subjectId,
        config.userId,
        config.moduleId || null,
        config.topicId || null,
        selectedProblems.length
      )

      const session = db.prepare("SELECT * FROM practice_sessions WHERE id = ?").get(res.lastInsertRowid) as PracticeSession

      return { session, problems: selectedProblems }
    } catch (err) {
      console.error("practice:createSession error:", err)
      throw err
    }
  })

  // ── 9. Get Practice Session ──────────────────────────────────────────────
  ipcMain.handle("practice:getSession", (_event, sessionId: number) => {
    try {
      const session = db.prepare("SELECT * FROM practice_sessions WHERE id = ?").get(sessionId) as PracticeSession | undefined
      if (!session) return null

      const attempts = db.prepare(`
        SELECT a.*, p.title as problem_title, p.problem_text, p.difficulty, p.principles_json
        FROM practice_problem_attempts a
        JOIN practice_problems p ON a.problem_id = p.id
        WHERE a.session_id = ?
        ORDER BY a.id ASC
      `).all(sessionId) as (PracticeProblemAttempt & { problem_title: string; problem_text: string })[]

      return { session, attempts }
    } catch (err) {
      console.error("practice:getSession error:", err)
      return null
    }
  })

  // ── 10. Submit Attempt & Evaluate ────────────────────────────────────────
  ipcMain.handle(
    "practice:submitAttempt",
    async (_event, sessionId: number, problemId: number, userAnswer: string, timeSpentSeconds: number) => {
      try {
        const problem = db.prepare("SELECT * FROM practice_problems WHERE id = ?").get(problemId) as PracticeProblem | undefined
        if (!problem) throw new Error("Problem not found.")

        const session = db.prepare("SELECT * FROM practice_sessions WHERE id = ?").get(sessionId) as PracticeSession | undefined
        if (!session) throw new Error("Practice session not found.")

        // Run AI evaluation
        const prompt = buildEvaluatePracticeAttemptPrompt(problem, userAnswer)
        const aiConfig = resolveAIConfig()
        if (!aiConfig.apiKey) throw new Error("AI API key not configured. Go to Settings to configure your AI provider.")

        const responseText = await callAIMessages(
          [{ role: "user", content: prompt }],
          aiConfig,
          { type: "json_object" }
        )

        const cleanedJson = cleanMarkdownFences(responseText)
        let evalResult: PracticeEvaluationResult
        try {
          evalResult = JSON.parse(cleanedJson)
        } catch {
          evalResult = {
            is_correct: false,
            feedback: responseText,
            step_analysis: [],
            identified_errors: []
          }
        }

        const isCorrectNum = evalResult.is_correct ? 1 : 0

        // Record attempt
        const insertStmt = db.prepare(`
          INSERT INTO practice_problem_attempts (
            session_id, problem_id, user_answer, is_correct, feedback, time_spent_seconds
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        const attemptRes = insertStmt.run(
          sessionId,
          problemId,
          userAnswer,
          isCorrectNum,
          evalResult.feedback,
          timeSpentSeconds || 0
        )

        // Update session aggregate stats
        db.prepare(`
          UPDATE practice_sessions
          SET completed_problems = completed_problems + 1,
              correct_problems = correct_problems + ?
          WHERE id = ?
        `).run(isCorrectNum, sessionId)

        // Memory Integration: Update tutor_topic_memories & concept_mastery
        try {
          let topicName = "General Practice"
          if (problem.topic_id) {
            const t = db.prepare("SELECT title FROM module_topics WHERE id = ?").get(problem.topic_id) as { title: string } | undefined
            if (t?.title) topicName = t.title
          } else if (problem.module_id) {
            const m = db.prepare("SELECT title FROM syllabus_modules WHERE id = ?").get(problem.module_id) as { title: string } | undefined
            if (m?.title) topicName = m.title
          }

          const existingMem = db.prepare(`
            SELECT * FROM tutor_topic_memories
            WHERE user_id = ? AND subject_id = ? AND topic = ?
          `).get(session.user_id, session.subject_id, topicName) as { id: number; mastery_level: string; struggles?: string; strengths?: string } | undefined

          const principles: string[] = JSON.parse(problem.principles_json || "[]")
          const errorType = evalResult.error_type || (isCorrectNum === 1 ? "correct" : "conceptual_misconception")
          const errorPrefix = errorType === "execution_slip" ? "[Calculation Slip] " : errorType === "boundary_condition_error" ? "[Boundary / Constraint] " : ""
          const errorSummary = (evalResult.identified_errors || []).join("; ")
          const detailedStruggle = errorSummary ? `${errorPrefix}${errorSummary}` : (evalResult.pedagogical_remedy || "Review derivation")
          const stepSummary = (evalResult.step_analysis || []).join("; ")

          if (existingMem) {
            let newLevel = existingMem.mastery_level
            if (isCorrectNum === 1) {
              newLevel = existingMem.mastery_level === "struggling" ? "developing" : "good"
            } else if (errorType === "execution_slip") {
              // Don't downgrade heavily for simple arithmetic slip if conceptual setup was good
              newLevel = existingMem.mastery_level === "mastered" ? "good" : existingMem.mastery_level
            } else {
              newLevel = existingMem.mastery_level === "good" || existingMem.mastery_level === "mastered" ? "developing" : "struggling"
            }

            db.prepare(`
              UPDATE tutor_topic_memories
              SET mastery_level = ?,
                  struggles = CASE WHEN ? = 0 THEN ? ELSE struggles END,
                  strengths = CASE WHEN ? = 1 THEN ? ELSE strengths END,
                  last_studied_at = datetime('now')
              WHERE id = ?
            `).run(newLevel, isCorrectNum, detailedStruggle, isCorrectNum, stepSummary, existingMem.id)
          } else {
            db.prepare(`
              INSERT INTO tutor_topic_memories (
                user_id, subject_id, topic, mastery_level, strengths, struggles
              ) VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              session.user_id,
              session.subject_id,
              topicName,
              isCorrectNum === 1 ? "good" : (errorType === "execution_slip" ? "developing" : "struggling"),
              isCorrectNum === 1 ? stepSummary : null,
              isCorrectNum === 0 ? detailedStruggle : null
            )
          }

          // Also record into concept_mastery if principles exist
          for (const p of principles) {
            if (!p || typeof p !== "string") continue
            // Differentiate delta: slips don't penalize concept mastery like misconceptions do
            const delta = isCorrectNum === 1
              ? 0.15
              : (errorType === "execution_slip" ? 0.0 : -0.12)
            db.prepare(`
              INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations)
              VALUES (?, ?, ?, ?, 1)
              ON CONFLICT(user_id, subject_id, concept) DO UPDATE SET
                mastery_prob = MAX(0.1, MIN(0.99, mastery_prob + ?)),
                observations = observations + 1,
                updated_at = datetime('now')
            `).run(session.user_id, session.subject_id, p, isCorrectNum === 1 ? 0.6 : 0.25, delta)
          }

          // ── CKRF Memory Updates (Glicko-2 & Misconception Ledger) ──────────
          try {
            recordTopicAssessment(
              db,
              session.user_id,
              session.subject_id,
              topicName,
              {
                itemDifficulty: problem.difficulty || 2,
                score: isCorrectNum === 1 ? 1.0 : (errorType === "execution_slip" ? 0.35 : 0.0)
              }
            )

            if (isCorrectNum === 1) {
              recordConceptSuccess(db, session.user_id, session.subject_id, topicName)
              for (const p of principles) {
                if (p && typeof p === "string") {
                  recordConceptSuccess(db, session.user_id, session.subject_id, p)
                }
              }
            } else {
              const mainConcept = (principles.length > 0 && typeof principles[0] === "string") ? principles[0] : topicName
              const misconceptionKey = `${topicName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${(evalResult.error_type || 'misconception').toLowerCase()}`
              const primaryError = (evalResult.identified_errors && evalResult.identified_errors[0]) || `Error in ${topicName}`
              recordMisconception(db, session.user_id, session.subject_id, {
                concept: mainConcept,
                misconceptionKey,
                misconceptionTitle: primaryError,
                description: detailedStruggle
              })
            }
          } catch (ckrfErr) {
            console.warn("Could not record CKRF memory update:", ckrfErr)
          }
        } catch (memErr) {
          console.warn("Could not update topic memory from practice attempt:", memErr)
        }

        const attempt = db.prepare("SELECT * FROM practice_problem_attempts WHERE id = ?").get(attemptRes.lastInsertRowid) as PracticeProblemAttempt

        return { success: true, evaluation: evalResult, attempt }
      } catch (err) {
        console.error("practice:submitAttempt error:", err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── 11. End Practice Session ─────────────────────────────────────────────
  ipcMain.handle("practice:endSession", (_event, sessionId: number, summary?: string) => {
    try {
      db.prepare(`
        UPDATE practice_sessions
        SET ended_at = datetime(now),
            summary = ?
        WHERE id = ?
      `).run(summary || null, sessionId)
      return { success: true }
    } catch (err) {
      console.error("practice:endSession error:", err)
      return { success: false, error: String(err) }
    }
  })

  // ── 12. Get Stats ────────────────────────────────────────────────────────
  ipcMain.handle("practice:getStats", (_event, subjectId: number, userId: number) => {
    try {
      const totalProblemsRow = db.prepare("SELECT COUNT(*) as count FROM practice_problems WHERE subject_id = ?").get(subjectId) as { count: number }
      const sessions = db.prepare(`
        SELECT COUNT(*) as total_sessions,
               SUM(completed_problems) as total_completed,
               SUM(correct_problems) as total_correct
        FROM practice_sessions
        WHERE subject_id = ? AND user_id = ?
      `).get(subjectId, userId) as { total_sessions: number; total_completed: number; total_correct: number }

      const totalProblems = totalProblemsRow?.count || 0
      const totalCompleted = sessions?.total_completed || 0
      const totalCorrect = sessions?.total_correct || 0
      const accuracy = totalCompleted > 0 ? Math.round((totalCorrect / totalCompleted) * 100) : 0

      return {
        totalProblems,
        totalSessions: sessions?.total_sessions || 0,
        totalCompleted,
        totalCorrect,
        accuracy
      }
    } catch (err) {
      console.error("practice:getStats error:", err)
      return { totalProblems: 0, totalSessions: 0, totalCompleted: 0, totalCorrect: 0, accuracy: 0 }
    }
  })
}
