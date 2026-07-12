# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-suite.spec.js >> 3. PWA & Manifest >> 3.3 App shell caches on first visit
- Location: e2e\qa-suite.spec.js:158:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
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
  82  |     expect(has404).toBe(true)
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
> 172 |     expect(visible).toBe(true)
      |                     ^ Error: expect(received).toBe(expected) // Object.is equality
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
  183 | // ─────────────────────────────────────────────────────────────
  184 | //  4. PAGE STRUCTURE & LAYOUT
  185 | // ─────────────────────────────────────────────────────────────
  186 | 
  187 | test.describe('4. Layout & Rendering', () => {
  188 | 
  189 |   test('4.1 Landing page has navigation', async ({ page }) => {
  190 |     await page.goto('/')
  191 |     await page.waitForLoadState('networkidle')
  192 |     // Check for common nav elements
  193 |     const navElements = page.locator('nav, header, [role="navigation"], .navbar, .header')
  194 |     const count = await navElements.count()
  195 |     expect(count).toBeGreaterThan(0)
  196 |   })
  197 | 
  198 |   test('4.2 Auth page layout loads without JS errors', async ({ page }) => {
  199 |     const errors = []
  200 |     page.on('pageerror', err => errors.push(err.message))
  201 |     await page.goto('/auth')
  202 |     await page.waitForLoadState('networkidle')
  203 |     await page.waitForTimeout(2000)
  204 |     expect(errors.length).toBe(0)
  205 |   })
  206 | 
  207 |   test('4.3 Landing page loads without JS errors', async ({ page }) => {
  208 |     const errors = []
  209 |     page.on('pageerror', err => errors.push(err.message))
  210 |     await page.goto('/')
  211 |     await page.waitForLoadState('networkidle')
  212 |     await page.waitForTimeout(2000)
  213 |     expect(errors.length).toBe(0)
  214 |   })
  215 | 
  216 |   test('4.4 404 page loads without JS errors', async ({ page }) => {
  217 |     const errors = []
  218 |     page.on('pageerror', err => errors.push(err.message))
  219 |     await page.goto('/nonexistent-route-12345')
  220 |     await page.waitForLoadState('networkidle')
  221 |     await page.waitForTimeout(2000)
  222 |     expect(errors.length).toBe(0)
  223 |   })
  224 | 
  225 |   test('4.5 Verify-email page loads without JS errors', async ({ page }) => {
  226 |     const errors = []
  227 |     page.on('pageerror', err => errors.push(err.message))
  228 |     await page.goto('/verify-email')
  229 |     await page.waitForLoadState('networkidle')
  230 |     await page.waitForTimeout(2000)
  231 |     expect(errors.length).toBe(0)
  232 |   })
  233 | 
  234 |   test('4.6 Rejected page loads without JS errors', async ({ page }) => {
  235 |     const errors = []
  236 |     page.on('pageerror', err => errors.push(err.message))
  237 |     await page.goto('/rejected')
  238 |     await page.waitForLoadState('networkidle')
  239 |     await page.waitForTimeout(2000)
  240 |     expect(errors.length).toBe(0)
  241 |   })
  242 | 
  243 |   test('4.7 Payment status page loads without JS errors', async ({ page }) => {
  244 |     const errors = []
  245 |     page.on('pageerror', err => errors.push(err.message))
  246 |     await page.goto('/payment-status')
  247 |     await page.waitForLoadState('networkidle')
  248 |     await page.waitForTimeout(2000)
  249 |     expect(errors.length).toBe(0)
  250 |   })
  251 | 
  252 |   test('4.8 Checkout page loads without JS errors', async ({ page }) => {
  253 |     const errors = []
  254 |     page.on('pageerror', err => errors.push(err.message))
  255 |     await page.goto('/checkout')
  256 |     await page.waitForLoadState('networkidle')
  257 |     await page.waitForTimeout(2000)
  258 |     expect(errors.length).toBe(0)
  259 |   })
  260 | })
  261 | 
  262 | // ─────────────────────────────────────────────────────────────
  263 | //  5. CONSOLE WARNINGS & ERRORS AUDIT
  264 | // ─────────────────────────────────────────────────────────────
  265 | 
  266 | test.describe('5. Console Audit', () => {
  267 | 
  268 |   test('5.1 No console errors on landing page', async ({ page }) => {
  269 |     const consoleErrors = []
  270 |     page.on('console', msg => {
  271 |       if (msg.type() === 'error') consoleErrors.push(msg.text())
  272 |     })
```