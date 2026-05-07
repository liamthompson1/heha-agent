export interface SessionData {
  userId?: string
  email?: string
  userHash?: string
  isAuthenticated: boolean
  // Agent (B2B) session fields. Present iff isAgent === true.
  isAgent?: boolean
  agentCode?: string
  initials?: string
  retailToken?: string
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
