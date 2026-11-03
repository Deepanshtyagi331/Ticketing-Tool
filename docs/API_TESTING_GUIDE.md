# Standalone TypeScript API Testing Guide

This guide describes how to run the standalone automated API test suite for the **Event Ticket Booking System**.

The test suite in [`api-tests/`](file:///Users/deepanshtyagi/Documents/Ticketing%20Tool/api-tests) executes genuine HTTP requests against the running backend API server (`http://localhost:5001` or a configurable `API_BASE_URL`), verifying all endpoints, business logic, security constraints, and concurrency guarantees.

---

## 📁 Test Suite Architecture

```
api-tests/
├── tsconfig.json                # Strict TypeScript configuration for test scripts
├── config/
│   └── test-config.ts           # Configurable environment variables and run ID generator
├── helpers/
│   ├── api-client.ts            # Typed HTTP client wrapping native fetch with timeout support
│   ├── auth-helper.ts           # Dynamic isolated user/admin session generator & HMAC signer
│   └── assertions.ts            # Terminal test runner with assertion helpers & exit code handler
├── auth.test.ts                 # Registration, login, token rotation, theft replay detection
├── events.test.ts               # Event CRUD, inventory guards, cursor pagination, search/filters
├── bookings.test.ts             # 10-minute hold, idempotency, seat decrement, sold-out checks
├── payments.test.ts             # HMAC-SHA256 signature verification, body tampering, duplicate delivery
├── concurrency.test.ts          # Mandatory 50-request parallel anti-overselling stress test
└── admin-reports.test.ts        # Admin revenue aggregation report & math fidelity verification
```

---

## ⚡ Prerequisites

1. **MongoDB Running**: Ensure MongoDB is running locally on port `27017` (or configured via `MONGODB_URI`).
2. **Backend Server Running**: Start the backend API on port `5001`:
   ```bash
   npm run dev:backend
   ```
   Confirm server readiness at: [`http://localhost:5001/health`](http://localhost:5001/health).

---

## 🚀 Execution Commands

All scripts are configured in the root [`package.json`](file:///Users/deepanshtyagi/Documents/Ticketing%20Tool/package.json):

### 1. Run Complete Test Suite (All 6 Suites)
```bash
npm run test:api
```
*Executes Auth, Events, Bookings, Payments, Concurrency, and Reports in sequence.*

---

### 2. Run Individual Test Suites

#### A. Authentication & Authorization Suite
Tests valid registration, missing field rejection, weak password rejection, duplicate email handling, login validation, protected routes, atomic refresh token rotation, stolen token reuse detection, and admin role enforcement.
```bash
npm run test:api:auth
```

#### B. Event Management API Suite
Tests admin event creation, regular user blocking (403), capacity expansion, inventory reduction guards, single event retrieval, cursor-based pagination (no `skip()`), page cursor stability, text search, and date-range filters.
```bash
npm run test:api:events
```

#### C. Booking Engine & Idempotency Suite
Tests 10-minute seat holds in `PENDING` status, dynamic price calculation, inventory decrements, idempotent replay with identical `Idempotency-Key` headers, missing key rejections, over-allocation rejections (409), and user booking retrieval.
```bash
npm run test:api:bookings
```

#### D. Payment Webhook & HMAC Verification Suite
Tests cryptographic HMAC-SHA256 signature verification over exact raw request bodies, rejection of invalid/missing signatures (401), request body tampering detection, and duplicate webhook delivery idempotency (`already_confirmed`).
```bash
npm run test:api:payments
```

#### E. Concurrency Stress Test Suite (50 Parallel Requests)
Creates an isolated event with exactly 10 seats, provisions 50 independent authenticated users, and fires 50 simultaneous parallel requests via `Promise.all` over live TCP sockets. Asserts that exactly 10 succeed (HTTP 201), exactly 40 receive HTTP 409, final inventory reaches 0, and zero overselling occurs.
```bash
npm run test:api:concurrency
```

#### F. Admin Revenue Report Suite
Tests admin access to `GET /admin/reports/revenue`, regular user blocking (403), date query validation, and verifies aggregation calculations against underlying confirmed bookings.
```bash
npm run test:api:reports
```

---

## 🛠️ Configuration & Environment Overrides

You can point the test suite to any host or port by setting environment variables:

```bash
# Example: Running against a remote or alternative port
API_BASE_URL=http://localhost:5001 npm run test:api

# Example: Overriding shared payment webhook secret
PAYMENT_WEBHOOK_SECRET=my_custom_hmac_secret npm run test:api:payments
```

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `API_BASE_URL` | `http://localhost:5001` | Base URL of the running API server |
| `PAYMENT_WEBHOOK_SECRET` | `webhook_super_secret_shared_hmac_key_2026` | Shared secret for HMAC-SHA256 signatures |

---

## 🔒 Safety and Isolation Guarantees

1. **Isolated Data**: Every test execution generates a unique timestamped run ID (e.g. `test_user_mw0xxx@test.local`). Tests create their own isolated events and bookings, never modifying existing development records.
2. **Credential Safety**: The test client never logs raw passwords, JWT tokens, or webhook secrets in terminal output.
3. **Exit Codes**: The test runner tracks all assertions. If any test fails, the process exits with code `1`, making it ready for CI/CD pipelines.

