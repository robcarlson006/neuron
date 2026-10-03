import {
  assertOAuthState,
  buildGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleAuthorizationCode,
  refreshGoogleAccessToken
} from '../../electron/ipc/googleCalendarOAuth'
import { isValidGoogleClientId } from '../../electron/ipc/googleCalendarService'

describe('googleCalendarOAuth', () => {
  const response = (payload: unknown, status: number) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  })

  test('creates PKCE state and authorization URL', () => {
    const oauth = createOAuthState()
    expect(oauth.state).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(oauth.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    const url = new URL(buildGoogleAuthorizationUrl('client-id', 'http://127.0.0.1:1234/oauth2callback', oauth))
    expect(url.hostname).toBe('accounts.google.com')
    expect(url.searchParams.get('state')).toBe(oauth.state)
    expect(url.searchParams.get('code_challenge')).toBe(oauth.challenge)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('access_type')).toBe('offline')
  })

  test('rejects missing or mismatched OAuth state', () => {
    expect(() => assertOAuthState('expected', null)).toThrow(/invalid state/i)
    expect(() => assertOAuthState('expected', 'wrong')).toThrow(/invalid state/i)
    expect(() => assertOAuthState('expected', 'expected')).not.toThrow()
  })

  test('exchanges authorization code and refreshes an access token', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ access_token: 'access-1', expires_in: 3600, refresh_token: 'refresh-1' }, 200))
      .mockResolvedValueOnce(response({ access_token: 'access-2', expires_in: 3600 }, 200))

    await expect(exchangeGoogleAuthorizationCode('client', 'code', 'http://127.0.0.1:1/callback', 'verifier', fetchImpl)).resolves.toMatchObject({ refresh_token: 'refresh-1' })
    await expect(refreshGoogleAccessToken('client', 'refresh-1', fetchImpl)).resolves.toMatchObject({ access_token: 'access-2' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  test('uses the PKCE desktop flow without requiring a client secret', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ access_token: 'access-1', expires_in: 3600, refresh_token: 'refresh-1' }, 200))

    await exchangeGoogleAuthorizationCode('desktop-client', 'code', 'http://127.0.0.1:1/callback', 'verifier', fetchImpl)

    const request = fetchImpl.mock.calls[0][1] as RequestInit
    const body = new URLSearchParams(String(request.body))
    expect(body.get('client_id')).toBe('desktop-client')
    expect(body.get('code_verifier')).toBe('verifier')
    expect(body.get('client_secret')).toBeNull()
  })

  test('surfaces provider token errors', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ error: 'invalid_grant', error_description: 'Token revoked' }, 400))
    await expect(refreshGoogleAccessToken('client', 'refresh', fetchImpl)).rejects.toThrow('Token revoked')
  })

  test('accepts Google OAuth client IDs and rejects account emails', () => {
    expect(isValidGoogleClientId('123456789.apps.googleusercontent.com')).toBe(true)
    expect(isValidGoogleClientId('person@example.com')).toBe(false)
    expect(isValidGoogleClientId('')).toBe(false)
  })
})
