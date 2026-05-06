export interface SessionData {
  userId?: string
  email?: string
  userHash?: string
  isAuthenticated: boolean
}

export interface OtpRequestResult {
  smsError?: string
  emailError?: string
  smsSentToContactNumberEnding?: string
}

export interface OtpVerifyResult {
  success: boolean
  firebaseToken?: string
}
