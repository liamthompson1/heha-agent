import type { OtpRequestResult, OtpVerifyResult } from './types'

const GRAPHQL_URL = process.env.HX_AUTH_GRAPHQL_URL!
const TRAVELLER_GRAPHQL_URL = process.env.HX_TRAVELLER_GRAPHQL_URL ?? 'https://traveller-api.dock-yard.io/graphql'

const OTP_DEFAULTS = {
  language: 'en',
  masterBrand: 'holidayextras',
  referrerUrl: 'https://www.holidayextras.com',
  browser: 'Chrome',
  operatingSystem: 'Unknown',
}


export async function createAccountAndSignIn(
  email: string,
  password: string,
): Promise<{ firebaseToken: string | null; cookies: string[] }> {
  // Step 1: create account with a known password
  const createRes = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation { createCustomerAccount(userInput: { email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }) { id } }`,
    }),
  })
  const createJson = await createRes.json()
  if (createJson.errors?.length) throw new Error(createJson.errors[0].message)

  // Step 2: sign in with email + password to get auth_session cookie
  const signInRes = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation SignIn($email: String!, $password: String!, $language: String, $masterBrand: String, $referrerUrl: String, $browser: String, $operatingSystem: String) {
        signInCustomerWithEmailAndPassword(email: $email, password: $password, language: $language, masterBrand: $masterBrand, referrerUrl: $referrerUrl, browser: $browser, operatingSystem: $operatingSystem) {
          success firebaseToken
        }
      }`,
      variables: { email, password, ...OTP_DEFAULTS },
    }),
  })
  const signInJson = await signInRes.json()
  if (signInJson.errors?.length) throw new Error(signInJson.errors[0].message)
  const cookies = signInRes.headers.getSetCookie?.() ?? []
  return {
    firebaseToken: signInJson.data?.signInCustomerWithEmailAndPassword?.firebaseToken ?? null,
    cookies,
  }
}

export async function completeProfile(
  hxToken: string,
  profile: { givenName?: string; familyName?: string; contactNumber?: string },
): Promise<boolean> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${hxToken}`,
      'Cookie': `auth_session=${hxToken}`,
    },
    body: JSON.stringify({
      query: `mutation CompleteProfile($givenName: String, $familyName: String, $contactNumber: String) {
        completeRegistration(givenName: $givenName, familyName: $familyName, contactNumber: $contactNumber) {
          success
        }
      }`,
      variables: profile,
    }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data?.completeRegistration?.success ?? false
}

export async function getCustomerFromToken(token: string): Promise<{ email: string } | null> {
  try {
    const res = await fetch(TRAVELLER_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `auth_session=${token}; auth_token=${token}`,
      },
      body: JSON.stringify({ query: `query { getTraveller { profile { email } } }` }),
    })
    const json = await res.json()
    const email = json.data?.getTraveller?.profile?.email
    if (typeof email === 'string' && email.includes('@')) return { email }
    return null
  } catch {
    return null
  }
}

export async function requestOtp(email: string): Promise<OtpRequestResult> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation GenerateOTP($email: String!, $language: String!, $masterBrand: String!, $referrerUrl: String!, $browser: String!, $operatingSystem: String!) {
        generateOTPCode(email: $email, language: $language, masterBrand: $masterBrand, referrerUrl: $referrerUrl, browser: $browser, operatingSystem: $operatingSystem) {
          smsError emailError smsSentToContactNumberEnding
        }
      }`,
      variables: { email, ...OTP_DEFAULTS },
    }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data.generateOTPCode as OtpRequestResult
}

export async function verifyOtp(
  email: string,
  otp: string,
): Promise<{ data: OtpVerifyResult; cookies: string[] }> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation SignInWithOTP($email: String!, $otp: String!, $language: String, $masterBrand: String, $referrerUrl: String, $browser: String, $operatingSystem: String) {
        signInCustomerWithOTP(email: $email, otp: $otp, language: $language, masterBrand: $masterBrand, referrerUrl: $referrerUrl, browser: $browser, operatingSystem: $operatingSystem) {
          success firebaseToken
        }
      }`,
      variables: { email, otp, ...OTP_DEFAULTS },
    }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  const cookies = res.headers.getSetCookie?.() ?? []
  return { data: json.data.signInCustomerWithOTP as OtpVerifyResult, cookies }
}
