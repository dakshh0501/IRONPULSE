# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-suite.spec.js >> 2. Routing & Navigation >> 2.2 404 page renders for unknown route
- Location: e2e\qa-suite.spec.js:75:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: ⚠️
  - heading "Something went wrong" [level=3] [ref=e5]
  - paragraph [ref=e6]: "Failed to fetch dynamically imported module: http://localhost:3000/src/pages/NotFound.jsx"
  - generic [ref=e7]: at Lazy at RenderedRoute (http://localhost:3000/node_modules/.vite/deps/react-router-dom.js?v=8390d069:4131:5) at Routes (http://localhost:3000/node_modules/.vite/deps/react-router-dom.js?v=8390d069:4601:5) at Suspense at RouterTree at ErrorBoundary (http://localhost:3000/src/components/ErrorBoundary.jsx:7:5) at AppProvider (http://localhost:3000/src/context/AppContext.jsx:132:31) at AuthProvider (http://localhost:3000/src/context/AuthContext.jsx:60:32) at App (http://localhost:3000/src/App.jsx:1149:41) at Router (http://localhost:3000/node_modules/.vite/deps/react-router-dom.js?v=8390d069:4544:15) at BrowserRouter (http://localhost:3000/node_modules/.vite/deps/react-router-dom.js?v=8390d069:5290:5)
  - button "Reload Page" [ref=e8] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | // ─────────────────────────────────────────────────────────────
  4   | //  1. AUTHENTICATION & ONBOARDING
  5   | // ─────────────────────────────────────────────────────────────
  6   | 
  7   | test.describe('1. Auth & Onboarding', () => {
  8   | 
  9   |   test('1.1 Landing page renders and CTA works', async ({ page }) => {
  10  |     await page.goto('/')
  11  |     await expect(page.locator('text=IRONPULSE').first()).toBeVisible({ timeout: 10000 })
  12  |     const cta = page.locator('a[href="/auth"], button:has-text("Get Started"), a:has-text("Get Started")')
  13  |     await expect(cta.first()).toBeVisible()
  14  |   })
  15  | 
  16  |   test('1.2 Auth page renders with sign-up form', async ({ page }) => {
  17  |     await page.goto('/auth')
  18  |     await page.waitForLoadState('networkidle')
  19  |     // Should show sign-in or sign-up form
  20  |     const body = page.locator('body')
  21  |     await expect(body).toContainText(/sign|login|register|email|password/i)
  22  |   })
  23  | 
  24  |   test('1.3 Auth page has email/password fields', async ({ page }) => {
  25  |     await page.goto('/auth')
  26  |     await page.waitForLoadState('networkidle')
  27  |     const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
  28  |     const passwordInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="password" i]')
  29  |     await expect(emailInput.first()).toBeVisible({ timeout: 5000 })
  30  |     await expect(passwordInput.first()).toBeVisible({ timeout: 5000 })
  31  |   })
  32  | 
  33  |   test('1.4 Forgot password link exists', async ({ page }) => {
  34  |     await page.goto('/auth')
  35  |     await page.waitForLoadState('networkidle')
  36  |     const forgotLink = page.locator('text=/forgot/i')
  37  |     await expect(forgotLink.first()).toBeVisible({ timeout: 5000 })
  38  |   })
  39  | 
  40  |   test('1.5 Form validation rejects invalid email', async ({ page }) => {
  41  |     await page.goto('/auth')
  42  |     await page.waitForLoadState('networkidle')
  43  |     const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  44  |     const passwordInput = page.locator('input[type="password"], input[name="password"]').first()
  45  |     const submitBtn = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Login"), button:has-text("Register")').first()
  46  | 
  47  |     if (await emailInput.isVisible() && await submitBtn.isVisible()) {
  48  |       await emailInput.fill('not-an-email')
  49  |       if (await passwordInput.isVisible()) await passwordInput.fill('short')
  50  |       // HTML5 validation should fire or form should show error
  51  |       const isValid = await emailInput.evaluate(el => el.checkValidity())
  52  |       if (!isValid) {
  53  |         // HTML5 validation passes
  54  |         expect(true).toBe(true)
  55  |       }
  56  |     }
  57  |   })
  58  | })
  59  | 
  60  | // ─────────────────────────────────────────────────────────────
  61  | //  2. ROUTING & NAVIGATION
  62  | // ─────────────────────────────────────────────────────────────
  63  | 
  64  | test.describe('2. Routing & Navigation', () => {
  65  | 
  66  |   test('2.1 Unauthed user redirected from protected route', async ({ page }) => {
  67  |     await page.goto('/dashboard')
  68  |     await page.waitForLoadState('networkidle')
  69  |     // Should stay on /dashboard (loading screen) or redirect to / or /auth
  70  |     const currentUrl = page.url()
  71  |     const onTarget = currentUrl.includes('/dashboard') || currentUrl.includes('/auth') || currentUrl === 'http://localhost:3000/'
  72  |     expect(onTarget).toBe(true)
  73  |   })
  74  | 
  75  |   test('2.2 404 page renders for unknown route', async ({ page }) => {
  76  |     await page.goto('/this-route-definitely-does-not-exist-xyz')
  77  |     await page.waitForLoadState('networkidle')
  78  |     const body = page.locator('body')
  79  |     const text = await body.textContent()
  80  |     // Should show some kind of 404 / not found content
  81  |     const has404 = /404|not found|four.zero.four/i.test(text || '')
> 82  |     expect(has404).toBe(true)
      |                    ^ Error: expect(received).toBe(expected) // Object.is equality
  83  |   })
  84  | 
  85  |   test('2.3 Landing page at root works', async ({ page }) => {
  86  |     await page.goto('/')
  87  |     await page.waitForLoadState('networkidle')
  88  |     const body = page.locator('body')
  89  |     await expect(body).toBeVisible()
  90  |     const text = await body.textContent()
  91  |     expect(text?.length).toBeGreaterThan(50)
  92  |   })
  93  | 
  94  |   test('2.4 Verify email page accessible', async ({ page }) => {
  95  |     await page.goto('/verify-email')
  96  |     await page.waitForLoadState('networkidle')
  97  |     const body = page.locator('body')
  98  |     await expect(body).toBeVisible()
  99  |   })
  100 | 
  101 |   test('2.5 Rejected page accessible', async ({ page }) => {
  102 |     await page.goto('/rejected')
  103 |     await page.waitForLoadState('networkidle')
  104 |     const body = page.locator('body')
  105 |     await expect(body).toBeVisible()
  106 |   })
  107 | 
  108 |   test('2.6 Payment status page is reachable', async ({ page }) => {
  109 |     await page.goto('/payment-status')
  110 |     await page.waitForLoadState('networkidle')
  111 |     const body = page.locator('body')
  112 |     await expect(body).toBeVisible()
  113 |   })
  114 | 
  115 |   test('2.7 Checkout page is reachable', async ({ page }) => {
  116 |     await page.goto('/checkout')
  117 |     await page.waitForLoadState('networkidle')
  118 |     const body = page.locator('body')
  119 |     await expect(body).toBeVisible()
  120 |   })
  121 | })
  122 | 
  123 | // ─────────────────────────────────────────────────────────────
  124 | //  3. PWA & OFFLINE
  125 | // ─────────────────────────────────────────────────────────────
  126 | 
  127 | test.describe('3. PWA & Manifest', () => {
  128 | 
  129 |   test('3.1 Manifest loads with correct properties', async ({ page }) => {
  130 |     await page.goto('/')
  131 |     const manifestLink = page.locator('link[rel="manifest"]')
  132 |     const href = await manifestLink.getAttribute('href')
  133 |     expect(href).toBeTruthy()
  134 | 
  135 |     const manifestResp = await page.request.get(href || '/manifest.json')
  136 |     expect(manifestResp.ok()).toBe(true)
  137 |     const manifest = await manifestResp.json()
  138 |     expect(manifest.name).toBe('IRONPULSE')
  139 |     expect(manifest.short_name).toBe('IRONPULSE')
  140 |     expect(manifest.display).toBe('standalone')
  141 |     expect(manifest.icons).toBeDefined()
  142 |     expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
  143 |   })
  144 | 
  145 |   test('3.2 Service worker registers', async ({ page }) => {
  146 |     await page.goto('/')
  147 |     // Give SW time to register
  148 |     await page.waitForTimeout(3000)
  149 |     const swUrls = await page.evaluate(() =>
  150 |       navigator.serviceWorker.getRegistrations().then(regs =>
  151 |         regs.map(r => r.active?.url || r.installing?.url || r.waiting?.url)
  152 |       )
  153 |     )
  154 |     const hasSW = swUrls.some(u => u && u.includes('sw.js'))
  155 |     expect(hasSW).toBe(true)
  156 |   })
  157 | 
  158 |   test('3.3 App shell caches on first visit', async ({ page }) => {
  159 |     await page.goto('/')
  160 |     await page.waitForLoadState('networkidle')
  161 |     // Navigate to activate SW
  162 |     await page.goto('/auth')
  163 |     await page.waitForLoadState('networkidle')
  164 |     await page.waitForTimeout(1000)
  165 |     // Go offline and try to navigate
  166 |     await page.context().setOffline(true)
  167 |     await page.goto('/').catch(() => {})
  168 |     await page.waitForTimeout(2000)
  169 |     const body = page.locator('body')
  170 |     const visible = await body.isVisible()
  171 |     await page.context().setOffline(false)
  172 |     expect(visible).toBe(true)
  173 |   })
  174 | 
  175 |   test('3.4 Theme color matches manifest', async ({ page }) => {
  176 |     await page.goto('/')
  177 |     const themeMeta = page.locator('meta[name="theme-color"]')
  178 |     const themeColor = await themeMeta.getAttribute('content')
  179 |     expect(themeColor).toBeTruthy()
  180 |   })
  181 | })
  182 | 
```