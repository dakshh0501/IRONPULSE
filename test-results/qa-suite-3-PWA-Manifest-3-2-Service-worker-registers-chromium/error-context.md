# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-suite.spec.js >> 3. PWA & Manifest >> 3.2 Service worker registers
- Location: e2e\qa-suite.spec.js:145:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: IP
      - generic [ref=e7]: IRONPULSE
    - generic [ref=e8]:
      - link "Features" [ref=e9] [cursor=pointer]:
        - /url: "#features"
      - link "Pricing" [ref=e10] [cursor=pointer]:
        - /url: "#pricing"
      - link "About" [ref=e11] [cursor=pointer]:
        - /url: "#about"
      - link "FAQ" [ref=e12] [cursor=pointer]:
        - /url: "#faq"
      - link "Contact" [ref=e13] [cursor=pointer]:
        - /url: "#contact"
    - generic [ref=e14]:
      - button "Sign In" [ref=e15] [cursor=pointer]
      - button "Get Started" [ref=e16] [cursor=pointer]
  - generic [ref=e18]:
    - generic [ref=e19]:
      - generic [ref=e20]: Gym Management Platform
      - heading "MANAGE YOUR GYM WITH IRONPULSE." [level=1] [ref=e22]:
        - text: MANAGE YOUR GYM
        - text: WITH IRONPULSE.
      - paragraph [ref=e23]: Professional all-in-one software for gym owners. Manage members, payments, subscriptions, trainers, reports and business insights from one powerful platform.
      - generic [ref=e24]:
        - button "Start Free Trial" [ref=e25] [cursor=pointer]
        - button "Watch Demo" [ref=e26] [cursor=pointer]
      - generic [ref=e27]:
        - generic [ref=e28]:
          - generic [ref=e29]: ✓
          - text: Secure
        - generic [ref=e30]:
          - generic [ref=e31]: ✓
          - text: Cloud Based
        - generic [ref=e32]:
          - generic [ref=e33]: ✓
          - text: PhonePe
        - generic [ref=e34]:
          - generic [ref=e35]: ✓
          - text: License Protected
    - generic [ref=e36]:
      - generic [ref=e49]:
        - generic [ref=e51]:
          - generic [ref=e52]:
            - generic [ref=e53]: Revenue
            - generic [ref=e54]: ₹2.4L
          - generic [ref=e55]:
            - generic [ref=e56]: Members
            - generic [ref=e57]: "156"
          - generic [ref=e58]:
            - generic [ref=e59]: Growth
            - generic [ref=e60]: 89%
          - generic [ref=e61]:
            - generic [ref=e62]: Trainers
            - generic [ref=e63]: "12"
        - generic [ref=e72]:
          - generic [ref=e73]: Mon
          - generic [ref=e74]: Tue
          - generic [ref=e75]: Wed
          - generic [ref=e76]: Thu
          - generic [ref=e77]: Fri
          - generic [ref=e78]: Sat
          - generic [ref=e79]: Sun
      - generic [ref=e80]:
        - generic [ref=e81]: Today's Revenue
        - generic [ref=e82]: ₹12,480
      - generic [ref=e83]:
        - generic [ref=e84]: Active Members
        - generic [ref=e85]: "156"
      - generic [ref=e86]:
        - generic [ref=e87]: Attendance
        - generic [ref=e88]: 89%
      - generic [ref=e89]:
        - generic [ref=e90]: Monthly Growth
        - generic [ref=e91]: +32%
      - generic [ref=e92]:
        - generic [ref=e93]: Subscription
        - generic [ref=e94]: Active ✓
  - generic [ref=e96]:
    - generic [ref=e97]:
      - generic [ref=e98]: 32%
      - generic [ref=e99]: Member Growth
    - generic [ref=e100]:
      - generic [ref=e101]: "240"
      - generic [ref=e102]: Monthly Revenue
    - generic [ref=e103]:
      - generic [ref=e104]: 999%
      - generic [ref=e105]: Uptime
    - generic [ref=e106]:
      - generic [ref=e107]: 500+
      - generic [ref=e108]: Gyms Onboarded
  - generic [ref=e110]:
    - paragraph [ref=e111]: Trusted by Growing Gyms
    - generic [ref=e112]:
      - generic [ref=e113]:
        - generic [ref=e114]: 0+
        - generic [ref=e115]: Gyms
      - generic [ref=e116]:
        - generic [ref=e117]: 0K+
        - generic [ref=e118]: Members
      - generic [ref=e119]:
        - generic [ref=e120]: 0Cr+
        - generic [ref=e121]: Processed
      - generic [ref=e122]:
        - generic [ref=e123]: 0%
        - generic [ref=e124]: Availability
  - generic [ref=e125]:
    - generic [ref=e126]:
      - paragraph [ref=e127]: Everything Included
      - heading "Everything your gym needs. Nothing it doesn't." [level=2] [ref=e128]:
        - text: Everything your gym needs.
        - text: Nothing it doesn't.
    - generic [ref=e129]:
      - generic [ref=e131]:
        - generic [ref=e132]: 👥
        - heading "Member Management" [level=3] [ref=e133]
        - paragraph [ref=e134]: Full profiles, attendance tracking, check-in system, plan assignment, and communication tools for every member.
      - generic [ref=e136]:
        - generic [ref=e137]: 📋
        - heading "Attendance" [level=3] [ref=e138]
        - paragraph [ref=e139]: QR-based check-in, manual entry, real-time tracking, heatmaps, and detailed attendance reports with peak hour analysis.
      - generic [ref=e141]:
        - generic [ref=e142]: ✅
        - heading "Trainer Management" [level=3] [ref=e143]
        - paragraph [ref=e144]: Assign trainers, track sessions, manage schedules, performance metrics, and client relationships in one place.
      - generic [ref=e146]:
        - generic [ref=e147]: 🏋️
        - heading "Workout Plans" [level=3] [ref=e148]
        - paragraph [ref=e149]: Custom routines with sets, reps, rest times, exercise libraries, and progress tracking for every member.
      - generic [ref=e151]:
        - generic [ref=e152]: 🥗
        - heading "Diet Plans" [level=3] [ref=e153]
        - paragraph [ref=e154]: Macro-tracked meal plans, calorie targets, meal schedules, and nutrition guidance assigned per member goal.
      - generic [ref=e156]:
        - generic [ref=e157]: 💰
        - heading "Payments" [level=3] [ref=e158]
        - paragraph [ref=e159]: Invoices, payment tracking, PhonePe integration, automated reminders, revenue analytics, and financial records.
      - generic [ref=e161]:
        - generic [ref=e162]: 📊
        - heading "Reports" [level=3] [ref=e163]
        - paragraph [ref=e164]: Revenue, attendance, member growth, trainer performance — all with interactive charts and CSV/PDF export.
      - generic [ref=e166]:
        - generic [ref=e167]: 📅
        - heading "Subscriptions" [level=3] [ref=e168]
        - paragraph [ref=e169]: Membership plans, auto-renewals, upgrades, downgrades, trial management, and subscription lifecycle automation.
  - generic [ref=e170]:
    - generic [ref=e171]:
      - heading "Everything in one dashboard." [level=2] [ref=e172]
      - paragraph [ref=e173]: Complete visibility into every aspect of your gym business from a single, powerful interface.
    - generic [ref=e202]:
      - generic [ref=e205]: Reports
      - generic [ref=e213]: Payments
      - generic [ref=e221]: Members
  - generic [ref=e227]:
    - generic [ref=e228]:
      - paragraph [ref=e229]: Simple Process
      - heading "How It Works" [level=2] [ref=e230]
    - generic [ref=e231]:
      - generic [ref=e233]:
        - generic [ref=e234]: "01"
        - heading "Register Gym" [level=3] [ref=e235]
        - paragraph [ref=e236]: Sign up your gym with basic details. Takes less than 5 minutes.
      - generic [ref=e238]:
        - generic [ref=e239]: "02"
        - heading "Get Approved" [level=3] [ref=e240]
        - paragraph [ref=e241]: Super admin reviews and approves your application within 24-48 hours.
      - generic [ref=e243]:
        - generic [ref=e244]: "03"
        - heading "Choose Plan" [level=3] [ref=e245]
        - paragraph [ref=e246]: Pick a subscription plan that fits your gym size and requirements.
      - generic [ref=e248]:
        - generic [ref=e249]: "04"
        - heading "Setup Gym" [level=3] [ref=e250]
        - paragraph [ref=e251]: Configure your gym profile, trainers, members, and plan details.
      - generic [ref=e253]:
        - generic [ref=e254]: "05"
        - heading "Add Members" [level=3] [ref=e255]
        - paragraph [ref=e256]: Import or add members manually. Assign plans and start tracking.
      - generic [ref=e258]:
        - generic [ref=e259]: "06"
        - heading "Start Managing" [level=3] [ref=e260]
        - paragraph [ref=e261]: Use attendance, payments, reports, and all tools from day one.
      - generic [ref=e263]:
        - generic [ref=e264]: "07"
        - heading "Grow Business" [level=3] [ref=e265]
        - paragraph [ref=e266]: Analytics and insights help you make data-driven decisions to grow.
  - generic [ref=e267]:
    - generic [ref=e268]:
      - paragraph [ref=e269]: Why Choose Us
      - heading "Built for modern gyms" [level=2] [ref=e270]
    - generic [ref=e271]:
      - generic [ref=e273]:
        - generic [ref=e274]: ⚡
        - heading "Lightning Fast" [level=3] [ref=e275]
        - paragraph [ref=e276]: Optimized for speed. Pages load instantly with lazy loading and code splitting.
      - generic [ref=e278]:
        - generic [ref=e279]: 🛡️
        - heading "Secure" [level=3] [ref=e280]
        - paragraph [ref=e281]: Firebase Auth, Firestore security rules, encrypted data, and role-based access control.
      - generic [ref=e283]:
        - generic [ref=e284]: ☁️
        - heading "Cloud Sync" [level=3] [ref=e285]
        - paragraph [ref=e286]: Real-time sync across devices. Changes reflect instantly for all users.
      - generic [ref=e288]:
        - generic [ref=e289]: 👥
        - heading "Role Based" [level=3] [ref=e290]
        - paragraph [ref=e291]: Admin, trainer, member, and owner roles with granular permissions and access control.
      - generic [ref=e293]:
        - generic [ref=e294]: 📊
        - heading "Rich Reports" [level=3] [ref=e295]
        - paragraph [ref=e296]: Interactive charts, exportable data, revenue analytics, and business insights.
      - generic [ref=e298]:
        - generic [ref=e299]: 🔑
        - heading "License Protected" [level=3] [ref=e300]
        - paragraph [ref=e301]: Per-gym license enforcement with device registration and audit logging.
  - generic [ref=e302]:
    - generic [ref=e303]:
      - paragraph [ref=e304]: Pricing
      - heading "Simple, transparent pricing" [level=2] [ref=e305]
    - generic [ref=e306]:
      - generic [ref=e308]:
        - generic [ref=e309]: Trial
        - generic [ref=e310]: ₹014 days
        - generic [ref=e311]:
          - generic [ref=e312]:
            - generic [ref=e313]: ✓
            - text: Gym floor access
          - generic [ref=e314]:
            - generic [ref=e315]: ✓
            - text: 1 trainer session
          - generic [ref=e316]:
            - generic [ref=e317]: ✓
            - text: Basic reports
          - generic [ref=e318]:
            - generic [ref=e319]: ✓
            - text: Up to 20 members
        - button "Start Trial" [ref=e320] [cursor=pointer]
      - generic [ref=e322]:
        - generic [ref=e323]: Standard
        - generic [ref=e324]: ₹99/month
        - generic [ref=e325]:
          - generic [ref=e326]:
            - generic [ref=e327]: ✓
            - text: Full gym access
          - generic [ref=e328]:
            - generic [ref=e329]: ✓
            - text: 2 trainer sessions/week
          - generic [ref=e330]:
            - generic [ref=e331]: ✓
            - text: Diet & workout plans
          - generic [ref=e332]:
            - generic [ref=e333]: ✓
            - text: Progress tracking
          - generic [ref=e334]:
            - generic [ref=e335]: ✓
            - text: QR check-in
        - button "Get Started" [ref=e336] [cursor=pointer]
      - generic [ref=e338]:
        - generic [ref=e339]: Recommended
        - generic [ref=e340]: Premium
        - generic [ref=e341]: ₹199/month
        - generic [ref=e342]:
          - generic [ref=e343]:
            - generic [ref=e344]: ✓
            - text: Everything in Standard
          - generic [ref=e345]:
            - generic [ref=e346]: ✓
            - text: Unlimited sessions
          - generic [ref=e347]:
            - generic [ref=e348]: ✓
            - text: Priority support
          - generic [ref=e349]:
            - generic [ref=e350]: ✓
            - text: Custom reports
          - generic [ref=e351]:
            - generic [ref=e352]: ✓
            - text: Multiple locations
        - button "Get Started" [ref=e353] [cursor=pointer]
      - generic [ref=e355]:
        - generic [ref=e356]: Quarterly
        - generic [ref=e357]: ₹299/quarter
        - generic [ref=e358]:
          - generic [ref=e359]:
            - generic [ref=e360]: ✓
            - text: Everything in Premium
          - generic [ref=e361]:
            - generic [ref=e362]: ✓
            - text: Dedicated account manager
          - generic [ref=e363]:
            - generic [ref=e364]: ✓
            - text: API access
          - generic [ref=e365]:
            - generic [ref=e366]: ✓
            - text: White-label option
          - generic [ref=e367]:
            - generic [ref=e368]: ✓
            - text: Early feature access
        - button "Get Started" [ref=e369] [cursor=pointer]
      - generic [ref=e371]:
        - generic [ref=e372]: Enterprise
        - generic [ref=e373]: Custom
        - generic [ref=e374]:
          - generic [ref=e375]:
            - generic [ref=e376]: ✓
            - text: Everything in Yearly
          - generic [ref=e377]:
            - generic [ref=e378]: ✓
            - text: On-premise option
          - generic [ref=e379]:
            - generic [ref=e380]: ✓
            - text: Custom integrations
          - generic [ref=e381]:
            - generic [ref=e382]: ✓
            - text: SLA guarantee
          - generic [ref=e383]:
            - generic [ref=e384]: ✓
            - text: 24/7 phone support
        - button "Contact Us" [ref=e385] [cursor=pointer]
  - generic [ref=e386]:
    - generic [ref=e387]:
      - paragraph [ref=e388]: Testimonials
      - heading "Trusted by gym owners" [level=2] [ref=e389]
    - generic [ref=e391]:
      - generic [ref=e392]:
        - generic [ref=e393]:
          - generic [ref=e394]: ★
          - generic [ref=e395]: ★
          - generic [ref=e396]: ★
          - generic [ref=e397]: ★
          - generic [ref=e398]: ★
        - paragraph [ref=e399]: "\"IRONPULSE transformed how we manage our gym. Member check-ins, payments, and reports are now effortless. The PhonePe integration alone saved us hours of manual work.\""
        - generic [ref=e400]:
          - generic [ref=e401]: RS
          - generic [ref=e402]:
            - generic [ref=e403]: Rajesh Sharma
            - generic [ref=e404]: FitLife Gym, Mumbai
      - generic [ref=e405]:
        - generic [ref=e406]:
          - generic [ref=e407]: ★
          - generic [ref=e408]: ★
          - generic [ref=e409]: ★
          - generic [ref=e410]: ★
          - generic [ref=e411]: ★
        - paragraph [ref=e412]: "\"The dashboard gives me complete visibility into my business. Revenue tracking, member retention, and trainer management — all in one place. Worth every rupee.\""
        - generic [ref=e413]:
          - generic [ref=e414]: PP
          - generic [ref=e415]:
            - generic [ref=e416]: Priya Patel
            - generic [ref=e417]: Iron Haven, Delhi
      - generic [ref=e418]:
        - generic [ref=e419]:
          - generic [ref=e420]: ★
          - generic [ref=e421]: ★
          - generic [ref=e422]: ★
          - generic [ref=e423]: ★
          - generic [ref=e424]: ★
        - paragraph [ref=e425]: "\"We tried 4 other platforms before IRONPULSE. Nothing comes close to the feature set and polish. The workout and diet plan modules are game changers.\""
        - generic [ref=e426]:
          - generic [ref=e427]: AV
          - generic [ref=e428]:
            - generic [ref=e429]: Amit Verma
            - generic [ref=e430]: Powerhouse Fitness, Bangalore
      - generic [ref=e431]:
        - generic [ref=e432]:
          - generic [ref=e433]: ★
          - generic [ref=e434]: ★
          - generic [ref=e435]: ★
          - generic [ref=e436]: ★
          - generic [ref=e437]: ★
        - paragraph [ref=e438]: "\"The attendance system with QR check-in is brilliant. Our members love the PWA — no app store needed. Reports export is a lifesaver for our monthly reviews.\""
        - generic [ref=e439]:
          - generic [ref=e440]: SR
          - generic [ref=e441]:
            - generic [ref=e442]: Sneha Reddy
            - generic [ref=e443]: Peak Performance, Hyderabad
      - generic [ref=e444]:
        - generic [ref=e445]:
          - generic [ref=e446]: ★
          - generic [ref=e447]: ★
          - generic [ref=e448]: ★
          - generic [ref=e449]: ★
          - generic [ref=e450]: ★
        - paragraph [ref=e451]: "\"Setup was incredibly smooth. The multi-tenant architecture means I can manage multiple gym locations from one super admin account. Highly recommended.\""
        - generic [ref=e452]:
          - generic [ref=e453]: VS
          - generic [ref=e454]:
            - generic [ref=e455]: Vikram Singh
            - generic [ref=e456]: Titan Gym, Pune
  - generic [ref=e463]:
    - generic [ref=e464]:
      - paragraph [ref=e465]: FAQ
      - heading "Frequently asked questions" [level=2] [ref=e466]
    - generic [ref=e467]:
      - generic [ref=e469] [cursor=pointer]:
        - generic [ref=e470]:
          - generic [ref=e471]: How does the subscription work?
          - generic [ref=e472]: +
        - paragraph [ref=e473]: Choose a plan (Monthly/Quarterly/Yearly) during gym setup. Payments are processed through PhonePe. Your subscription auto-renews unless cancelled. You can upgrade or downgrade anytime.
      - generic [ref=e475] [cursor=pointer]:
        - generic [ref=e476]:
          - generic [ref=e477]: How do approvals work?
          - generic [ref=e478]: +
        - paragraph [ref=e479]: When a gym registers, a super admin reviews and approves the application. Approved gyms get full access. The approval process typically takes 24-48 hours.
      - generic [ref=e481] [cursor=pointer]:
        - generic [ref=e482]:
          - generic [ref=e483]: How do payments work?
          - generic [ref=e484]: +
        - paragraph [ref=e485]: Members can pay via PhonePe, cash, or card. The system generates invoices automatically. Revenue reports and payment history are available in real-time.
      - generic [ref=e487] [cursor=pointer]:
        - generic [ref=e488]:
          - generic [ref=e489]: What is PhonePe integration?
          - generic [ref=e490]: +
        - paragraph [ref=e491]: IRONPULSE integrates with PhonePe for seamless payment processing. Members get a secure checkout flow, and gym owners receive instant payment confirmations.
      - generic [ref=e493] [cursor=pointer]:
        - generic [ref=e494]:
          - generic [ref=e495]: How does the license system work?
          - generic [ref=e496]: +
        - paragraph [ref=e497]: Each gym gets a license tied to their subscription. Device registration prevents unauthorized access. Licenses can be managed from the settings panel.
      - generic [ref=e499] [cursor=pointer]:
        - generic [ref=e500]:
          - generic [ref=e501]: What support is available?
          - generic [ref=e502]: +
        - paragraph [ref=e503]: We offer email support, documentation, and a ticketing system. Premium plans include priority support and dedicated account management.
  - generic [ref=e504]:
    - generic [ref=e505]:
      - paragraph [ref=e506]: Get In Touch
      - heading "Have a question?" [level=2] [ref=e507]
    - generic [ref=e509]:
      - textbox "Your Name *" [ref=e510]
      - textbox "Email Address *" [ref=e511]
      - textbox "Phone Number (optional)" [ref=e512]
      - textbox "Your Message *" [ref=e513]
      - button "Send Message" [ref=e514] [cursor=pointer]
  - generic [ref=e516]:
    - heading "Ready to modernize your gym?" [level=2] [ref=e517]
    - paragraph [ref=e518]: Start your free trial today. No credit card required. Full access for 14 days.
    - generic [ref=e519]:
      - button "Get Started Free" [ref=e520] [cursor=pointer]
      - button "Book a Demo" [ref=e521] [cursor=pointer]
  - contentinfo [ref=e522]:
    - generic [ref=e523]:
      - generic [ref=e524]:
        - generic [ref=e525]:
          - generic [ref=e526]: IP
          - generic [ref=e527]: IRONPULSE
        - paragraph [ref=e528]: Professional gym management platform. Built for high-performance gyms that demand the best.
        - generic [ref=e529]:
          - link "𝕏" [ref=e530] [cursor=pointer]:
            - /url: https://twitter.com/ironpulse
          - link "in" [ref=e531] [cursor=pointer]:
            - /url: https://linkedin.com/company/ironpulse
          - link "▶" [ref=e532] [cursor=pointer]:
            - /url: https://youtube.com/@ironpulse
          - link "📷" [ref=e533] [cursor=pointer]:
            - /url: https://instagram.com/ironpulse
      - generic [ref=e534]:
        - heading "Product" [level=4] [ref=e535]
        - link "Features" [ref=e536] [cursor=pointer]:
          - /url: "#features"
        - link "Pricing" [ref=e537] [cursor=pointer]:
          - /url: "#pricing"
        - link "Integrations" [ref=e538] [cursor=pointer]:
          - /url: "#features"
        - link "Changelog" [ref=e539] [cursor=pointer]:
          - /url: "#about"
      - generic [ref=e540]:
        - heading "Contact" [level=4] [ref=e541]
        - link "💬 WhatsApp Business +91 9371880039" [ref=e542] [cursor=pointer]:
          - /url: "#"
          - text: 💬 WhatsApp Business
          - text: +91 9371880039
        - link "✉️ ironpulsexa@gmail.com" [ref=e543] [cursor=pointer]:
          - /url: mailto:ironpulsexa@gmail.com
        - generic [ref=e544]:
          - text: 🕐 Business Hours
          - text: Monday – Saturday
          - text: 9:00 AM – 8:00 PM
      - generic [ref=e545]:
        - heading "Legal" [level=4] [ref=e546]
        - link "Privacy" [ref=e547] [cursor=pointer]:
          - /url: /privacy
        - link "Terms" [ref=e548] [cursor=pointer]:
          - /url: /terms
        - link "License" [ref=e549] [cursor=pointer]:
          - /url: /license
        - link "Cookies" [ref=e550] [cursor=pointer]:
          - /url: /cookies
    - generic [ref=e551]:
      - button "🔗 Share Website" [ref=e553] [cursor=pointer]
      - paragraph [ref=e554]: © 2025 IRONPULSE. All rights reserved. Built for high-performance gyms.
```

# Test source

```ts
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
> 155 |     expect(hasSW).toBe(true)
      |                   ^ Error: expect(received).toBe(expected) // Object.is equality
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
```