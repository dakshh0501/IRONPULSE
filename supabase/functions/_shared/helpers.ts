// _shared/helpers.ts — IRONPULSE Step 8G
// Shared, dependency-free utilities for the payment Edge Functions.
// Deno-compatible: Web Crypto only (no Node imports). Faithful ports of
// functions/index.js helpers (checksums, IDs, endpoints, status maps).

export type JsonRecord = Record<string, unknown>

/** JSON response helper */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** sha256 hex digest of a UTF-8 string */
export async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** bytes → base64 (btoa is byte-chunk-safe for <64KB; loop keeps it safe for all) */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** base64 → UTF-8 string */
export function base64ToString(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** base64 HMAC-SHA256 (Cashfree webhook spec) */
export async function hmacSha256Base64(key: string, message: Uint8Array): Promise<string> {
  const keyBuf = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', keyBuf, message)
  return bytesToBase64(new Uint8Array(sig))
}

/** Constant-time ASCII/base64 string comparison */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** random hex of n bytes */
export function randomHex(nBytes: number): string {
  const bytes = new Uint8Array(nBytes)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** generateMerchantTransactionId port: IP{ts36}{6hex}, max 35 chars */
export function generateMerchantTransactionId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  return `IP${ts}${randomHex(3).toUpperCase()}`.substring(0, 35)
}

/** generateCashfreeOrderId port: CF-{ts36}-{8hex}, max 50 chars */
export function generateCashfreeOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  return `CF-${ts}-${randomHex(4).toUpperCase()}`.substring(0, 50)
}

/** paymentId (legacy format): IP-{ts36}-{4hex} */
export function generatePaymentId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  return `IP-${ts}-${randomHex(2).toUpperCase()}`
}

/** PhonePe config from env (legacy loadPhonePeConfig port) */
export function loadPhonePeConfig(): { merchantId: string; saltKey: string; saltIndex: string } | null {
  const merchantId = Deno.env.get('PHONEPE_MERCHANT_ID') || ''
  const saltKey = Deno.env.get('PHONEPE_SALT_KEY') || ''
  const saltIndex = Deno.env.get('PHONEPE_SALT_INDEX') || ''
  if (!merchantId || !saltKey || !saltIndex) return null
  return { merchantId, saltKey, saltIndex }
}

/** PhonePe config validation (legacy validatePhonePeConfig port) */
export function validatePhonePeConfig(config: { merchantId: string; saltKey: string; saltIndex: string }) {
  const errors: string[] = []
  if (!config.merchantId || config.merchantId.trim() === '') errors.push('Merchant ID required')
  if (!config.saltKey || config.saltKey.trim() === '') errors.push('Salt Key required')
  if (!config.saltIndex || config.saltIndex.trim() === '') errors.push('Salt Index required')
  else if (isNaN(Number(config.saltIndex))) errors.push('Salt Index must be a number')
  return { valid: errors.length === 0, errors }
}

/** PhonePe pay checksum: sha256(base64Payload + endpoint + saltKey) + ### + saltIndex */
export function phonePeChecksum(
  base64Payload: string,
  endpoint: string,
  saltKey: string,
  saltIndex: string,
): Promise<string> {
  return sha256Hex(base64Payload + endpoint + saltKey).then((h) => `${h}###${saltIndex}`)
}

/** PhonePe status checksum (legacy generateStatusChecksum port) */
export function phonePeStatusChecksum(
  merchantId: string,
  merchantTransactionId: string,
  saltKey: string,
  saltIndex: string,
): Promise<string> {
  const endpoint = `/pg/v1/status/${merchantId}/${merchantTransactionId}`
  return sha256Hex(endpoint + saltKey).then((h) => `${h}###${saltIndex}`)
}

/** PhonePe callback expected hash over the DECODED response JSON string */
export function phonePeCallbackChecksum(
  decodedJson: string,
  merchantId: string,
  merchantTransactionId: string,
  saltKey: string,
): Promise<string> {
  const responseString = decodedJson + '/pg/v1/status/' + merchantId + '/' + merchantTransactionId + saltKey
  return sha256Hex(responseString)
}

/** PhonePe endpoints — sandbox when merchantId starts with PGTEST (legacy parity) */
export function getPhonePeApiEndpoint(merchantId: string) {
  const isSandbox = !!merchantId && merchantId.startsWith('PGTEST')
  if (isSandbox) {
    return {
      pay: 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay',
      status: (mid: string, mtx: string) =>
        `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${mid}/${mtx}`,
    }
  }
  return {
    pay: 'https://api.phonepe.com/apis/hermes/pg/v1/pay',
    status: (mid: string, mtx: string) => `https://api.phonepe.com/apis/hermes/pg/v1/status/${mid}/${mtx}`,
  }
}

/** PhonePe state → canonical status (legacy stateMap port) */
export function mapPhonePeState(state: string | null): 'success' | 'failed' | 'cancelled' | 'pending' {
  switch (state) {
    case 'COMPLETED':
    case 'PAYMENT_SUCCESS':
      return 'success'
    case 'FAILED':
    case 'PAYMENT_FAILED':
      return 'failed'
    case 'EXPIRED':
      return 'cancelled'
    case 'PENDING':
      return 'pending'
    default:
      return 'pending'
  }
}

/** Cashfree config from env (legacy loadCashfreeConfig port) */
export function loadCashfreeConfig():
  | { clientId: string; clientSecret: string; mode: string; apiVersion: string; baseUrl: string }
  | null {
  const clientId = Deno.env.get('CASHFREE_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('CASHFREE_CLIENT_SECRET') || ''
  const mode = Deno.env.get('CASHFREE_MODE') === 'production' ? 'production' : 'sandbox'
  if (!clientId || !clientSecret) return null
  return {
    clientId,
    clientSecret,
    mode,
    apiVersion: '2023-08-01',
    baseUrl: mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg',
  }
}

/** Cashfree REST headers (legacy cashfreeHeaders port) */
export function cashfreeHeaders(config: { clientId: string; clientSecret: string; apiVersion: string }) {
  return {
    'x-client-id': config.clientId,
    'x-client-secret': config.clientSecret,
    'x-api-version': config.apiVersion,
    'Content-Type': 'application/json',
  }
}

/** Cashfree order/payment status → canonical (legacy mapCashfreeOrderStatus port) */
export function mapCashfreeOrderStatus(orderStatus: string | null): 'success' | 'failed' | 'cancelled' | 'pending' {
  switch (String(orderStatus || '').toUpperCase()) {
    case 'PAID':
    case 'SUCCESS':
      return 'success'
    case 'ACTIVE':
    case 'PENDING':
    case 'INITIALIZED':
      return 'pending'
    case 'CANCELLED':
    case 'USER_DROPPED':
      return 'cancelled'
    case 'FAILED':
    case 'EXPIRED':
    default:
      return 'failed'
  }
}
