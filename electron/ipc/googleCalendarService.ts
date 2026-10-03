import { app, safeStorage, shell } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { buildGoogleAuthorizationUrl, createOAuthState, exchangeGoogleAuthorizationCode, refreshGoogleAccessToken, assertOAuthState, GOOGLE_CALENDAR_SCOPES, type GoogleTokenResponse } from './googleCalendarOAuth'
import { detectEventType, matchEventSubject } from './calendarSyncService'
import { GOOGLE_CALENDAR_IPC_VERSION, type GoogleCalendarConnection, type GoogleCalendarRuntimeStatus, type GoogleCalendarSyncResult } from '../../src/types'

const SYNC_PAST_DAYS = 365
const SYNC_FUTURE_DAYS = 730
const BUILT_IN_GOOGLE_CLIENT_ID = process.env.NEURON_GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_ID_META_KEY = 'google_calendar_client_id'

interface GoogleCalendarApiItem {
  id: string
  summary?: string
  summaryOverride?: string
  description?: string
  timeZone?: string
  backgroundColor?: string
  primary?: boolean
}

interface GoogleEventItem {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  recurrence?: string[]
}

interface GoogleListResponse<T> {
  items?: T[]
  nextPageToken?: string
  nextSyncToken?: string
}

class GoogleCalendarApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'GoogleCalendarApiError'
  }
}

function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function eventDate(value?: { date?: string; dateTime?: string }): { value: string; allDay: boolean } | null {
  if (value?.date) return { value: `${value.date}T00:00:00`, allDay: true }
  if (!value?.dateTime) return null
  const parsed = new Date(value.dateTime)
  if (Number.isNaN(parsed.getTime())) return null
  return { value: localIso(parsed), allDay: false }
}

function encryptedToken(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure token storage is unavailable on this device')
  return safeStorage.encryptString(value).toString('base64')
}

function decryptedToken(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure token storage is unavailable on this device')
  return safeStorage.decryptString(Buffer.from(value, 'base64'))
}

function sendCallbackPage(response: ServerResponse, message: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<html><body><p>${message}</p><script>window.close()</script></body></html>`)
}

export class GoogleCalendarService {
  private db: any
  private accessTokens = new Map<number, { token: string; expiresAt: number }>()
  private authInFlight = false
  private handlerRegistered = false

  constructor(database: any) {
    this.db = database
  }

  setHandlerRegistered(value: boolean): void {
    this.handlerRegistered = value
  }

  private schemaStatus(): { ready: boolean; error?: string } {
    try {
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('google_calendar_accounts', 'calendar_sources')").all() as Array<{ name: string }>
      const tableNames = new Set(tables.map(table => table.name))
      if (!tableNames.has('google_calendar_accounts') || !tableNames.has('calendar_sources')) {
        return { ready: false, error: 'Google Calendar database tables are missing. Restart Neuron to run migrations.' }
      }
      const columns = new Set((this.db.pragma('table_info(calendar_sources)') as Array<{ name: string }>).map(column => column.name))
      const required = ['google_account_id', 'google_calendar_id', 'sync_token', 'provider_metadata_json', 'enabled']
      const missing = required.filter(column => !columns.has(column))
      if (missing.length > 0) return { ready: false, error: `Google Calendar database migration is incomplete (missing: ${missing.join(', ')}). Restart Neuron.` }
      return { ready: true }
    } catch (error: any) {
      return { ready: false, error: error?.message || 'Could not verify the Google Calendar database schema' }
    }
  }

  private clientIdInfo(): { value: string; configured: boolean; source: 'settings' | 'build' | 'missing' | 'invalid' } {
    let override = ''
    try {
      override = String(this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(GOOGLE_CLIENT_ID_META_KEY)?.value || '').trim()
    } catch {
      // The database check below reports schema readiness separately.
    }
    const value = override || BUILT_IN_GOOGLE_CLIENT_ID.trim()
    if (!value) return { value: '', configured: false, source: 'missing' }
    if (!isValidGoogleClientId(value)) return { value, configured: false, source: 'invalid' }
    return { value, configured: true, source: override ? 'settings' : 'build' }
  }

  getRuntimeStatus(userId?: number): GoogleCalendarRuntimeStatus {
    const schema = this.schemaStatus()
    const client = this.clientIdInfo()
    let accounts: GoogleCalendarConnection[] = []
    if (schema.ready && userId != null) accounts = this.getAccounts(userId)
    return {
      appVersion: app.getVersion(),
      integrationVersion: GOOGLE_CALENDAR_IPC_VERSION,
      handlerRegistered: this.handlerRegistered,
      schemaReady: schema.ready,
      clientIdConfigured: client.configured,
      clientIdSource: client.source,
      accounts,
      error: schema.error || (client.source === 'missing' ? 'Google Calendar is not configured. Add a Google OAuth client ID in Settings.' : client.source === 'invalid' ? 'The Google OAuth client ID is invalid.' : undefined)
    }
  }

  validateClientId(candidate: string): { valid: boolean; message: string } {
    const value = candidate.trim()
    if (!value) return { valid: false, message: 'Enter a Google OAuth Desktop client ID.' }
    if (!isValidGoogleClientId(value)) return { valid: false, message: 'Client IDs normally end with .apps.googleusercontent.com. This value does not match that format.' }
    return { valid: true, message: 'Client ID format is valid. Save it, then connect Google Calendar.' }
  }

  getAccounts(userId: number): GoogleCalendarConnection[] {
    return this.db.prepare(`
      SELECT id, user_id, status, scopes, last_synced_at, last_error, created_at, updated_at
      FROM google_calendar_accounts WHERE user_id = ? ORDER BY created_at ASC
    `).all(userId).map((row: any) => ({ ...row, scopes: JSON.parse(row.scopes || '[]') }))
  }

  private getAccount(userId: number, accountId: number): any {
    const row = this.db.prepare('SELECT * FROM google_calendar_accounts WHERE id = ? AND user_id = ?').get(accountId, userId)
    if (!row) throw new Error('Google Calendar account not found')
    return row
  }

  async connect(userId: number, replaceAccountId?: number): Promise<{ account: GoogleCalendarConnection; sync: GoogleCalendarSyncResult }> {
    const schema = this.schemaStatus()
    if (!schema.ready) throw new Error(schema.error || 'Google Calendar database schema is not ready')
    if (this.authInFlight) throw new Error('A Google Calendar authorization is already in progress')
    this.authInFlight = true
    try {
      const token = await this.authorize()
      if (!token.refresh_token) throw new Error('Google did not return a refresh token; revoke Neuron access in Google Account settings and try again')
      if (replaceAccountId != null) {
        this.getAccount(userId, replaceAccountId)
        this.db.prepare('DELETE FROM calendar_sources WHERE user_id = ? AND google_account_id = ?').run(userId, replaceAccountId)
        this.db.prepare('DELETE FROM google_calendar_accounts WHERE id = ? AND user_id = ?').run(replaceAccountId, userId)
        this.accessTokens.delete(replaceAccountId)
      }
      const result = this.db.prepare(`
        INSERT INTO google_calendar_accounts (user_id, encrypted_refresh_token, scopes, status)
        VALUES (?, ?, ?, 'connected')
      `).run(userId, encryptedToken(token.refresh_token), JSON.stringify(token.scope?.split(' ') || GOOGLE_CALENDAR_SCOPES))
      const accountId = Number(result.lastInsertRowid)
      this.accessTokens.set(accountId, { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 })
      const sync = await this.syncAccount(userId, accountId)
      return { account: this.getAccounts(userId).find(account => account.id === accountId)!, sync }
    } finally {
      this.authInFlight = false
    }
  }

  disconnect(userId: number, accountId: number): boolean {
    this.getAccount(userId, accountId)
    this.accessTokens.delete(accountId)
    this.db.prepare('DELETE FROM calendar_sources WHERE user_id = ? AND google_account_id = ?').run(userId, accountId)
    const result = this.db.prepare('DELETE FROM google_calendar_accounts WHERE id = ? AND user_id = ?').run(accountId, userId)
    return result.changes > 0
  }

  setSourceEnabled(userId: number, sourceId: number, enabled: boolean): boolean {
    const result = this.db.prepare(`UPDATE calendar_sources SET enabled = ? WHERE id = ? AND user_id = ? AND type = 'google_oauth'`).run(enabled ? 1 : 0, sourceId, userId)
    return result.changes > 0
  }

  async syncAccount(userId: number, accountId: number): Promise<GoogleCalendarSyncResult> {
    const account = this.getAccount(userId, accountId)
    let calendars: GoogleCalendarApiItem[]
    try {
      calendars = await this.listCalendars(accountId, account)
    } catch (error: any) {
      const message = error?.message || 'Could not retrieve Google calendars'
      const status = /invalid_grant|revoked|unauthorized|401/i.test(message) ? 'reauthorize_required' : 'error'
      this.db.prepare('UPDATE google_calendar_accounts SET status = ?, last_error = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(status, message, accountId, userId)
      return { success: false, eventCount: 0, calendarCount: 0, stage: 'calendar_list', error: message }
    }

    const subjects = this.db.prepare('SELECT id, name, course_code as courseCode FROM subjects WHERE user_id = ?').all(userId)
    let eventCount = 0
    const failures: string[] = []
    try {
      for (const calendar of calendars) {
        try {
          const source = this.upsertSource(userId, accountId, calendar)
          if (source.enabled !== 0) eventCount += await this.syncCalendar(userId, accountId, account, source, subjects)
        } catch (error: any) {
          failures.push(`${calendar.summary || calendar.id}: ${error?.message || 'sync failed'}`)
        }
      }
      const warning = failures.length > 0 ? `${failures.length} calendar${failures.length === 1 ? '' : 's'} could not be synced. ${failures.slice(0, 2).join(' | ')}` : undefined
      this.db.prepare("UPDATE google_calendar_accounts SET status = 'connected', last_error = ?, last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(warning || null, accountId, userId)
      return {
        success: failures.length === 0,
        eventCount,
        calendarCount: calendars.length,
        stage: failures.length > 0 ? 'event_sync' : undefined,
        partial: failures.length > 0 && eventCount > 0,
        warning,
        error: failures.length > 0 && eventCount === 0 ? warning : undefined
      }
    } catch (error: any) {
      const message = error?.message || 'Google Calendar sync failed'
      const status = /invalid_grant|revoked|unauthorized|401/i.test(message) ? 'reauthorize_required' : 'error'
      this.db.prepare('UPDATE google_calendar_accounts SET status = ?, last_error = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(status, message, accountId, userId)
      return { success: false, eventCount, calendarCount: calendars.length, stage: 'database', error: message }
    }
  }

  private async authorize(): Promise<GoogleTokenResponse> {
    const client = this.clientIdInfo()
    if (!client.configured) {
      if (client.source === 'invalid') throw new Error('Google Calendar is not configured: the OAuth client ID is invalid')
      throw new Error('Google Calendar is not configured. Add a Google OAuth Desktop client ID in Settings or package Neuron with NEURON_GOOGLE_CLIENT_ID.')
    }
    const oauth = createOAuthState()
    let server: Server | null = null
    let timeout: NodeJS.Timeout | null = null
    let callbackRedirectUri = ''
    try {
      const callback = await new Promise<{ code?: string; error?: string }>((resolve, reject) => {
        let callbackPort: number | null = null
        server = createServer((request: IncomingMessage, response: ServerResponse) => {
          try {
            const url = new URL(request.url || '/', 'http://127.0.0.1')
            if (url.pathname !== '/oauth2callback') return sendCallbackPage(response, 'Waiting for Google authorization…')
            if (url.searchParams.get('error')) {
              sendCallbackPage(response, 'Google authorization was cancelled. You can close this window.')
              resolve({ error: url.searchParams.get('error') || 'authorization_cancelled' })
              return
            }
            assertOAuthState(oauth.state, url.searchParams.get('state'))
            const code = url.searchParams.get('code')
            if (!code) throw new Error('Google authorization did not return a code')
            sendCallbackPage(response, 'Google Calendar connected. You can close this window and return to Neuron.')
            resolve({ code })
          } catch (error) {
            sendCallbackPage(response, 'Google authorization failed. You can close this window and return to Neuron.')
            reject(error)
          }
        })
        server.once('error', reject)
        server.listen(0, '127.0.0.1', async () => {
          const address = server?.address()
          if (!address || typeof address === 'string') return reject(new Error('Could not start Google authorization listener'))
          callbackPort = address.port
          callbackRedirectUri = `http://127.0.0.1:${callbackPort}/oauth2callback`
          try {
            await shell.openExternal(buildGoogleAuthorizationUrl(client.value, callbackRedirectUri, oauth))
          } catch (error) {
            reject(error)
          }
        })
        timeout = setTimeout(() => reject(new Error('Google Calendar authorization timed out')), 5 * 60 * 1000)
      })
      if (callback.error) throw new Error(`Google authorization failed: ${callback.error}`)
      if (!callbackRedirectUri) throw new Error('Google authorization listener closed unexpectedly')
      return await exchangeGoogleAuthorizationCode(client.value, callback.code!, callbackRedirectUri, oauth.verifier)
    } finally {
      if (timeout) clearTimeout(timeout)
      await new Promise<void>(resolve => server?.close(() => resolve()) || resolve())
    }
  }

  private async accessToken(accountId: number, account: any): Promise<string> {
    const cached = this.accessTokens.get(accountId)
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
    const client = this.clientIdInfo()
    if (!client.configured) throw new Error('Google Calendar is not configured: add a valid OAuth client ID before syncing')
    const token = await refreshGoogleAccessToken(client.value, decryptedToken(account.encrypted_refresh_token))
    this.accessTokens.set(accountId, { token: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 })
    return token.access_token
  }

  private async api<T>(accountId: number, account: any, path: string, retry = true): Promise<T> {
    const token = await this.accessToken(accountId, account)
    const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { headers: { authorization: `Bearer ${token}` } })
    if (response.status === 401 && retry) {
      this.accessTokens.delete(accountId)
      return this.api<T>(accountId, account, path, false)
    }
    const payload = await response.json() as T & { error?: { message?: string } }
    if (!response.ok) throw new GoogleCalendarApiError(payload.error?.message || `Google Calendar API failed (${response.status})`, response.status)
    return payload
  }

  private async listCalendars(accountId: number, account: any): Promise<GoogleCalendarApiItem[]> {
    const calendars: GoogleCalendarApiItem[] = []
    let pageToken = ''
    do {
      const query = new URLSearchParams({ maxResults: '250' })
      if (pageToken) query.set('pageToken', pageToken)
      const page = await this.api<GoogleListResponse<GoogleCalendarApiItem>>(accountId, account, `users/me/calendarList?${query.toString()}`)
      calendars.push(...(page.items || []))
      pageToken = page.nextPageToken || ''
    } while (pageToken)
    return calendars
  }

  private upsertSource(userId: number, accountId: number, calendar: GoogleCalendarApiItem): any {
    const existing = this.db.prepare('SELECT * FROM calendar_sources WHERE user_id = ? AND google_account_id = ? AND google_calendar_id = ?').get(userId, accountId, calendar.id)
    const name = calendar.summaryOverride || calendar.summary || calendar.id
    const metadata = JSON.stringify({ timeZone: calendar.timeZone, primary: Boolean(calendar.primary), description: calendar.description })
    if (existing) {
      this.db.prepare('UPDATE calendar_sources SET name = ?, color = ?, provider_metadata_json = ? WHERE id = ? AND user_id = ?').run(name, calendar.backgroundColor || existing.color, metadata, existing.id, userId)
      return this.db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(existing.id)
    }
    const result = this.db.prepare(`INSERT INTO calendar_sources (user_id, name, type, color, google_account_id, google_calendar_id, provider_metadata_json, enabled) VALUES (?, ?, 'google_oauth', ?, ?, ?, ?, 1)`).run(userId, name, calendar.backgroundColor || '#4285f4', accountId, calendar.id, metadata)
    return this.db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(Number(result.lastInsertRowid))
  }

  private async syncCalendar(userId: number, accountId: number, account: any, source: any, subjects: any[]): Promise<number> {
    try {
      return await this.syncCalendarOnce(userId, accountId, account, source, subjects)
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.status === 410 && source.sync_token) {
        this.db.prepare('UPDATE calendar_sources SET sync_token = NULL WHERE id = ?').run(source.id)
        source = { ...source, sync_token: null }
        return this.syncCalendarOnce(userId, accountId, account, source, subjects)
      }
      throw error
    }
  }

  private async syncCalendarOnce(userId: number, accountId: number, account: any, source: any, subjects: any[]): Promise<number> {
    const initial = !source.sync_token
    const params = new URLSearchParams({ maxResults: '2500', showDeleted: 'true', singleEvents: 'true' })
    if (initial) {
      const start = new Date(Date.now() - SYNC_PAST_DAYS * 86400000).toISOString()
      const end = new Date(Date.now() + SYNC_FUTURE_DAYS * 86400000).toISOString()
      params.set('timeMin', start); params.set('timeMax', end)
    } else params.set('syncToken', source.sync_token)

    let pageToken = ''
    let count = 0
    let syncToken: string | undefined
    do {
      if (pageToken) params.set('pageToken', pageToken)
      const page = await this.api<GoogleListResponse<GoogleEventItem>>(accountId, account, `calendars/${encodeURIComponent(source.google_calendar_id)}/events?${params.toString()}`)
      for (const event of page.items || []) {
        const externalId = event.id
        if (event.status === 'cancelled') {
          this.db.prepare('DELETE FROM calendar_events WHERE source_id = ? AND external_id = ?').run(source.id, externalId)
          continue
        }
        const start = eventDate(event.start)
        const end = eventDate(event.end)
        if (!start || !end) continue
        const subjectId = matchEventSubject(event.summary || 'Untitled event', event.description || '', subjects)
        const values = [event.summary || 'Untitled event', event.description || null, event.location || null, start.value, end.value, start.allDay ? 1 : 0, event.recurrence?.join('\n') || null, subjectId || null, detectEventType(event.summary || '', subjectId !== undefined)]
        const existing = this.db.prepare('SELECT id FROM calendar_events WHERE source_id = ? AND external_id = ?').get(source.id, externalId)
        if (existing) this.db.prepare('UPDATE calendar_events SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?, all_day = ?, recurrence_rule = ?, subject_id = ?, event_type = ?, updated_at = datetime(\'now\') WHERE id = ?').run(...values, existing.id)
        else this.db.prepare('INSERT INTO calendar_events (user_id, source_id, external_id, title, description, location, start_time, end_time, all_day, recurrence_rule, subject_id, event_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(userId, source.id, externalId, ...values)
        count++
      }
      pageToken = page.nextPageToken || ''
      syncToken = page.nextSyncToken || syncToken
    } while (pageToken)
    if (syncToken) this.db.prepare('UPDATE calendar_sources SET sync_token = ?, last_synced_at = datetime(\'now\') WHERE id = ?').run(syncToken, source.id)
    if (initial) this.db.prepare('UPDATE calendar_sources SET last_synced_at = datetime(\'now\') WHERE id = ?').run(source.id)
    return count
  }
}

export function isValidGoogleClientId(value: string): boolean {
  return /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value.trim())
}

let service: GoogleCalendarService | null = null

export function setGoogleCalendarDatabase(database: any): void { service = new GoogleCalendarService(database) }
export function getGoogleCalendarService(): GoogleCalendarService {
  if (!service) throw new Error('Google Calendar service is not initialized')
  return service
}
