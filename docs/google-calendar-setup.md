# Google Calendar OAuth setup

Neuron's Google Calendar connection uses a Google OAuth 2.0 **Desktop app** client and read-only Calendar API scopes.

## Google Cloud setup

1. Create separate Google Cloud projects for development and production.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen as an external app.
4. Add pilot accounts as test users.
5. Create an OAuth client with application type **Desktop app**.
6. For a packaged build, set the client ID while building Neuron:

```sh
export NEURON_GOOGLE_CLIENT_ID='your-desktop-client-id.apps.googleusercontent.com'
npm run build:mac:arm64
```

The client ID is not a secret. Neuron embeds the build-time value in the packaged main process. Development and testing builds can also enter a local override under Settings → Calendar → Google Calendar. The override is stored in `app_meta`; refresh tokens are encrypted with Electron `safeStorage` before persistence.

The app requests only:

- `https://www.googleapis.com/auth/calendar.events.readonly`
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

The first sync imports enabled calendars and events from the previous 12 months through the next 24 months. Public distribution requires Google OAuth verification and a privacy policy describing Calendar data use.
