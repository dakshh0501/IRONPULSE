# IRONPULSE — Production Deployment Guide

## Prerequisites

- Firebase CLI installed: `npm i -g firebase-tools`
- Logged in: `firebase login`
- Project selected: `firebase use <project-id>`
- PhonePe production credentials obtained from PhonePe dashboard

---

## 1. Set Functions Secrets (Required)

Run these commands **before** deploying functions. Secrets are injected at runtime via `process.env`.

```bash
# PhonePe Merchant ID (from PhonePe dashboard)
firebase functions:secrets:set PHONEPE_MERCHANT_ID

# PhonePe Salt Key (from PhonePe dashboard)
firebase functions:secrets:set PHONEPE_SALT_KEY

# PhonePe Salt Index (from PhonePe dashboard, typically "1")
firebase functions:secrets:set PHONEPE_SALT_INDEX
```

**Verify secrets are set:**
```bash
firebase functions:secrets:list
```

---

## 2. Deploy Firestore Indexes (Required)

Composite indexes must be built before queries work.

```bash
firebase deploy --only firestore:indexes
```

**Monitor index building:**
- Check Firebase Console → Firestore → Indexes
- Wait for all 9 indexes to show "Enabled" (can take 5-15 minutes)

---

## 3. Deploy All Services

```bash
# Deploy everything (hosting, functions, firestore rules, indexes)
firebase deploy
```

**Or deploy individually:**
```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

---

## 4. PhonePe Production Configuration

### In PhonePe Merchant Dashboard:
1. **Add Production Callback URL:**
   ```
   https://<your-project>.web.app/api/phonepe/callback
   ```
   Or custom domain:
   ```
   https://api.yourgym.com/api/phonepe/callback
   ```

2. **Add Redirect URL (for payment completion):**
   ```
   https://<your-project>.web.app/payment-status
   ```

3. **Verify Merchant ID does NOT start with `PGTEST`** (that's sandbox)
   - Production Merchant IDs are different from sandbox
   - `getPhonePeApiEndpoint()` auto-detects based on prefix

### Environment Detection Logic (in `functions/index.js`):
```javascript
const isSandbox = merchantId && merchantId.startsWith('PGTEST')
```
- Sandbox → `api-preprod.phonepe.com`
- Production → `api.phonepe.com`

---

## 5. Verify Deployment

### Check Functions Logs:
```bash
firebase functions:log
```

### Test Payment Flow:
1. Go to `/subscriptions` in deployed app
2. Click "Pay Now" on a pending subscription
3. Complete PhonePe payment
4. Verify redirect to `/payment-status` shows success
5. Check Firestore: `paymentAttempts` status → `success`
6. Check `subscriptions` collection: `paymentStatus` → `paid`
7. Check `payments` collection: new record created

### Test Webhook:
```bash
# View callback logs
firebase functions:log --only phonePeCallback
```

---

## 6. Environment Variables Reference

### Frontend (Vite)
| Variable | Source | Required |
|----------|--------|----------|
| `VITE_FIREBASE_API_KEY` | `.env.production` | Yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | `.env.production` | Yes |
| `VITE_FIREBASE_PROJECT_ID` | `.env.production` | Yes |
| `VITE_FIREBASE_STORAGE_BUCKET` | `.env.production` | Yes |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `.env.production` | Yes |
| `VITE_FIREBASE_APP_ID` | `.env.production` | Yes |

**Create `.env.production`:**
```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### Cloud Functions (Secrets)
| Secret | Description | Set Via |
|--------|-------------|---------|
| `PHONEPE_MERCHANT_ID` | PhonePe Merchant ID | `firebase functions:secrets:set` |
| `PHONEPE_SALT_KEY` | PhonePe Salt Key | `firebase functions:secrets:set` |
| `PHONEPE_SALT_INDEX` | PhonePe Salt Index (usually "1") | `firebase functions:secrets:set` |

---

## 7. Custom Domain (Optional)

```bash
# Add custom domain
firebase hosting:channel:deploy production

# Or via console: Hosting → Add custom domain
```

Update PhonePe callback/redirect URLs to use custom domain.

---

## 8. Rollback Procedure

```bash
# List deployments
firebase hosting:channel:list

# Rollback hosting
firebase hosting:clone <source-site>:<channel> <target-site>:live

# Rollback functions (redeploy previous version)
firebase functions:delete createPayment verifyPayment phonePeCallback
# Then redeploy
```

---

## 9. Monitoring Checklist

- [ ] Functions error rate < 1%
- [ ] Payment success rate > 95%
- [ ] Webhook delivery within 30s
- [ ] Firestore read/write latency < 500ms
- [ ] Hosting CDN cache hit rate > 90%

---

## 10. Support Contacts

| Service | Contact |
|---------|---------|
| Firebase Support | https://firebase.google.com/support |
| PhonePe Support | https://merchant.phonepe.com/support |
| IRONPULSE Team | admin@ironpulse.app |

---

## Quick Commands Reference

```bash
# Full deploy
firebase deploy

# Secrets
firebase functions:secrets:set PHONEPE_MERCHANT_ID
firebase functions:secrets:set PHONEPE_SALT_KEY
firebase functions:secrets:set PHONEPE_SALT_INDEX
firebase functions:secrets:list

# Indexes
firebase deploy --only firestore:indexes

# Logs
firebase functions:log
firebase functions:log --only phonePeCallback

# Local testing
cd functions && npm run serve
```