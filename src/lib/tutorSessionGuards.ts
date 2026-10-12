/** Atomically claims the single in-flight initialization slot for a tutor session. */
export function tryBeginTutorSessionInitialization(ref: { current: boolean }): boolean {
  if (ref.current) return false
  ref.current = true
  return true
}

/** Ignore stream events unless they belong to the conversation currently shown. */
export function shouldAcceptTutorChunk(activeConversationId: string | number | null | undefined,
  chunkConversationId: string | number | null | undefined): boolean {
  return activeConversationId != null && chunkConversationId != null && Number(activeConversationId) === Number(chunkConversationId)
}

export function resolveTutorActiveTopic(topics: string[], moduleTitle?: string, subjectName?: string): string {
  return topics[0] || moduleTitle || subjectName || ''
}
