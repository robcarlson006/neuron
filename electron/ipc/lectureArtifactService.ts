import fs from 'fs'
import path from 'path'

interface LectureArtifactDatabase {
  prepare(sql: string): any
}

type LectureArtifactResult = {
  transcriptPath: string
  notesPath: string
}

function safeName(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.slice(0, 120) || 'lecture'
}

function writeAtomically(filePath: string, contents: string): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, contents, 'utf8')
  fs.renameSync(temporaryPath, filePath)
}

/**
 * Exports the durable lecture record into the linked class folder without
 * touching the user's source files. The hidden .neuron directory is already
 * excluded from material scanning, so generated artifacts cannot re-import as
 * duplicate class materials.
 */
export function exportLectureArtifacts(
  database: LectureArtifactDatabase,
  lectureId: number,
  generatedNotes?: string
): LectureArtifactResult | null {
  const lecture = database.prepare(`
    SELECT l.id, l.title, l.raw_transcript, l.material_id, l.created_at, s.name, s.linked_folder_path
    FROM lectures l
    JOIN subjects s ON s.id = l.subject_id
    WHERE l.id = ?
  `).get(lectureId) as {
    id: number
    title: string
    raw_transcript?: string | null
    material_id?: number | null
    created_at: string
    name: string
    linked_folder_path?: string | null
  } | undefined

  if (!lecture?.linked_folder_path) return null

  const outputDirectory = path.join(lecture.linked_folder_path, '.neuron', 'lectures')
  fs.mkdirSync(outputDirectory, { recursive: true })
  const baseName = `${safeName(lecture.title)}-${lecture.id}`
  const transcriptPath = path.join(outputDirectory, `${baseName}.transcript.md`)
  const notesPath = path.join(outputDirectory, `${baseName}.notes.md`)

  const transcript = lecture.raw_transcript?.trim() || '_Transcript is not available yet._'
  writeAtomically(transcriptPath, `# ${lecture.title}\n\n- Class: ${lecture.name}\n- Recorded: ${lecture.created_at}\n\n## Transcript\n\n${transcript}\n`)

  const annotations = database.prepare(`
    SELECT kind, body, selected_text, created_at
    FROM document_annotations
    WHERE lecture_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
  `).all(lectureId) as Array<{ kind: string; body: string; selected_text?: string | null; created_at: string }>
  const annotationText = annotations.length > 0
    ? annotations.map((annotation) => {
      const quote = annotation.selected_text ? `\n> ${annotation.selected_text.replace(/\n/g, '\n> ')}\n` : ''
      return `### ${annotation.kind}\n\n${annotation.body}${quote}`
    }).join('\n\n')
    : '_No learner notes have been saved yet._'
  const persistedGeneratedNotes = generatedNotes?.trim() || (lecture.material_id
    ? (database.prepare('SELECT content_text FROM materials WHERE id = ?').get(lecture.material_id) as { content_text?: string } | undefined)?.content_text?.trim() || ''
    : '')
  const notesBody = persistedGeneratedNotes
    ? `${persistedGeneratedNotes}\n\n## Learner Cornell notes\n\n${annotationText}`
    : `## Learner Cornell notes\n\n${annotationText}`
  writeAtomically(notesPath, `# ${lecture.title} — Notes\n\n- Class: ${lecture.name}\n- Recorded: ${lecture.created_at}\n\n${notesBody}\n`)

  return { transcriptPath, notesPath }
}
