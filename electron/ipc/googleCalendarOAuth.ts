import { createHash, randomBytes } from 'node:crypto'

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
] as const

export interface GoogleOAuthState {
  state: string
  verifier: string
  challenge: string
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

export function base64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function createOAuthState(): GoogleOAuthState {
  const verifier = base64Url(randomBytes(32))
  return {
    state: base64Url(randomBytes(32)),
    verifier,
    challenge: base64Url(createHash('sha256').update(verifier).digest())
  }
}

export function buildGoogleAuthorizationUrl(clientId: string, redirectUri: string, oauth: GoogleOAuthState): string {
  if (!clientId.trim()) throw new Error('Google Calendar is not configured: NEURON_GOOGLE_CLIENT_ID is missing')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: oauth.state,
    code_challenge: oauth.challenge,
    code_challenge_method: 'S256'
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function assertOAuthState(expected: string, received: string | null): void {
  if (!received || received !== expected) throw new Error('Google Calendar authorization failed: invalid state')
}

export async function exchangeGoogleAuthorizationCode(
  clientId: string,
  code: string,
  redirectUri: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<GoogleTokenResponse> {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  })
  const payload = await response.json() as GoogleTokenResponse
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google token exchange failed (${response.status})`)
  }
  return payload
}

export async function refreshGoogleAccessToken(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<GoogleTokenResponse> {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  const payload = await response.json() as GoogleTokenResponse
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google token refresh failed (${response.status})`)
  }
  return payload
}
