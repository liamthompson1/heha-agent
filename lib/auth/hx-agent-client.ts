/**
 * B2B agent login against Holiday Extras.
 *
 * Endpoint: `POST https://www.holidayextras.com/login.php` (form-encoded).
 * Success is signalled by HTTP 302 + a `retailToken=<uuid>` Set-Cookie.
 * Any other response (typically 200, login form re-render) is a failure.
 *
 * Returned cookies we care about:
 *   - retailToken=<uuid>          long-lived agent session token
 *   - agent=<CODE>                 agency code (e.g. TRAIN)
 *   - agentData=<hex blob>         encrypted profile (opaque; passed through)
 *   - session=<numeric>            HX session id
 */

export interface AgentSignInResult {
  retailToken: string
  agentCode: string
  agentData: string
  sessionId: string
}

const LOGIN_URL = 'https://www.holidayextras.com/login.php'

// Re-use a real-looking UA so any WAF/bot rules don't bounce us.
const FAKE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

export async function signInAgent(
  abtaNum: string,
  password: string,
  initials: string,
): Promise<AgentSignInResult | null> {
  const body = new URLSearchParams({
    abtanum: abtaNum,
    abtapass: password,
    initials,
  }).toString()

  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': FAKE_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Origin': 'https://www.holidayextras.com',
      'Referer': 'https://www.holidayextras.com/login.php',
    },
    body,
  })

  // 5xx → upstream is broken, surface as a real error.
  if (res.status >= 500) {
    throw new Error(`HX login upstream error: ${res.status}`)
  }
  // Wrong creds re-render the login page with status 200; we want only 302.
  if (res.status !== 302) return null

  const setCookies = res.headers.getSetCookie?.() ?? []
  const cookies = parseSetCookies(setCookies)

  const retailToken = cookies.get('retailToken')
  const agentCode = cookies.get('agent')
  const agentData = cookies.get('agentData')
  const sessionId = cookies.get('session')

  // Belt-and-braces: a failed login can sometimes still return 302 with
  // `retailToken=deleted`. Treat anything that isn't a real UUID as failure.
  if (!retailToken || retailToken === 'deleted' || retailToken.length < 16) return null
  if (!agentCode || agentCode === 'deleted') return null

  return {
    retailToken,
    agentCode,
    agentData: agentData ?? '',
    sessionId: sessionId ?? '',
  }
}

/**
 * Pulls the latest value for each cookie name out of the Set-Cookie list.
 * Later entries win, so deletes followed by sets resolve to the set value.
 */
function parseSetCookies(setCookies: string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const raw of setCookies) {
    const eq = raw.indexOf('=')
    if (eq < 0) continue
    const name = raw.slice(0, eq).trim()
    const value = raw.slice(eq + 1).split(';')[0].trim()
    out.set(name, value)
  }
  return out
}
