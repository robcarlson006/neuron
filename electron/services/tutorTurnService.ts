import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type TutorTurnStatus = 'queued' | 'streaming' | 'complete' | 'cancelled' | 'failed'
export type TutorTurnTerminalReason = 'done' | 'cancelled' | 'first_token_timeout' | 'idle_timeout' | 'overall_timeout' | 'provider_error' | 'sender_destroyed'

export interface TutorTurn {
  id: string
  request_id: string
  session_id: number
  user_message_id: string
  assistant_message_id?: string
  status: TutorTurnStatus
  terminal_reason?: TutorTurnTerminalReason
  intended_cursor_json?: string
  session_revision: number
  created_at: string
  completed_at?: string
}

type MessageRow = { id: string; session_id: number; role: string; content: string; content_type: string; created_at: string }

function now(): string { return new Date().toISOString() }

/** Main-process owner for stream lifecycle persistence. Transactions never span provider calls. */
export class TutorTurnService {
  constructor(private readonly db: Database.Database) {}

  queueExistingUserTurn(input: { requestId: string; sessionId: number; message: string; intendedCursor?: unknown }): TutorTurn {
    const timestamp = now()
    const run = this.db.transaction(() => {
      const existing = this.db.prepare(`
        SELECT id, session_id, role, content, content_type, created_at
        FROM tutor_messages WHERE session_id = ? AND role = 'user' AND content = ?
        ORDER BY rowid DESC LIMIT 1
      `).get(input.sessionId, input.message) as MessageRow | undefined
      const userMessage = existing || this.db.prepare(`
        SELECT id, session_id, role, content, content_type, created_at
        FROM tutor_messages WHERE session_id = ? AND role = 'user'
        ORDER BY rowid DESC LIMIT 1
      `).get(input.sessionId) as MessageRow | undefined
      if (!userMessage) throw new Error('Tutor user message must be persisted before queueing a turn')
      const id = randomUUID()
      const revision = (this.db.prepare('SELECT COALESCE(finalization_revision, 0) AS revision FROM tutor_sessions WHERE id = ?').get(input.sessionId) as { revision: number } | undefined)?.revision ?? 0
      this.db.prepare(`
        INSERT INTO tutor_turns (id, request_id, session_id, user_message_id, status, intended_cursor_json, session_revision, created_at)
        VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)
        ON CONFLICT(request_id) DO NOTHING
      `).run(id, input.requestId, input.sessionId, userMessage.id, input.intendedCursor === undefined ? null : JSON.stringify(input.intendedCursor), revision, timestamp)
      return this.getByRequest(input.requestId)!
    })()
    return run
  }

  markStreaming(requestId: string): void {
    this.db.prepare("UPDATE tutor_turns SET status = 'streaming' WHERE request_id = ? AND status = 'queued'").run(requestId)
  }

  complete(requestId: string, content: string, metadata?: Record<string, unknown>): { turn: TutorTurn; assistantMessage: MessageRow } {
    const timestamp = now()
    return this.db.transaction(() => {
      const turn = this.getByRequest(requestId)
      if (!turn) throw new Error(`Unknown tutor turn ${requestId}`)
      const assistantId = randomUUID()
      const assistantMessage = {
        id: assistantId,
        session_id: turn.session_id,
        role: 'assistant',
        content,
        content_type: 'text',
        created_at: timestamp
      }
      this.db.prepare(`INSERT INTO tutor_messages (id, session_id, role, content, content_type, metadata, created_at) VALUES (?, ?, 'assistant', ?, 'text', ?, ?)`)
        .run(assistantId, turn.session_id, content, metadata ? JSON.stringify(metadata) : null, timestamp)
      this.db.prepare(`UPDATE tutor_turns SET assistant_message_id = ?, status = 'complete', terminal_reason = 'done', completed_at = ? WHERE request_id = ? AND status IN ('queued','streaming')`)
        .run(assistantId, timestamp, requestId)
      this.db.prepare('UPDATE tutor_sessions SET last_message_at = ? WHERE id = ?').run(Date.now(), turn.session_id)
      return { turn: this.getByRequest(requestId)!, assistantMessage }
    })()
  }

  terminate(requestId: string, reason: TutorTurnTerminalReason, partialContent?: string): TutorTurn | undefined {
    return this.db.transaction(() => {
      const turn = this.getByRequest(requestId)
      if (!turn || turn.status === 'complete' || turn.status === 'cancelled' || turn.status === 'failed') return turn
      let assistantId: string | undefined
      if (partialContent) {
        assistantId = randomUUID()
        this.db.prepare(`INSERT INTO tutor_messages (id, session_id, role, content, content_type, metadata, created_at) VALUES (?, ?, 'assistant', ?, 'text', ?, ?)`)
          .run(assistantId, turn.session_id, partialContent, JSON.stringify({ terminal_reason: reason, partial: true }), now())
      }
      const status = reason === 'cancelled' || reason === 'sender_destroyed' ? 'cancelled' : 'failed'
      this.db.prepare(`UPDATE tutor_turns SET assistant_message_id = COALESCE(?, assistant_message_id), status = ?, terminal_reason = ?, completed_at = ? WHERE request_id = ?`)
        .run(assistantId ?? null, status, reason, now(), requestId)
      return this.getByRequest(requestId)
    })()
  }

  getByRequest(requestId: string): TutorTurn | undefined {
    return this.db.prepare('SELECT * FROM tutor_turns WHERE request_id = ?').get(requestId) as TutorTurn | undefined
  }
}
