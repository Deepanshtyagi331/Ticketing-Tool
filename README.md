# Event Ticket Booking System — Production TypeScript Platform

A robust, high-concurrency event ticket booking platform engineered with **Node.js**, **Express**, **TypeScript (Strict Mode)**, **MongoDB/Mongoose**, and **React (Vite)**. Built to guarantee zero overselling, strict idempotency, multi-worker safety, cryptographic HMAC payment confirmation, and automated 10-minute inventory holds.

---

## 🌟 Key Features

### 1. Concurrency Control & Zero Overselling
- **Atomic Conditional Updates**: Eliminates race conditions by enforcing `{ availableSeats: { $gte: seats } }` with `$inc: { availableSeats: -seats }` at the database engine level.
- **Dual-Topology Safety**: Automatically supports multi-document ACID transactions on MongoDB Replica Sets while maintaining atomic conditional rollback compensation on standalone MongoDB instances.
- **Strict Non-Negative Inventory**: Inventory cannot drop below zero even under parallel bursts.

### 2. Idempotency & Financial Safety
- **Scoped Idempotency**: User-scoped unique compound index on `{ userId: 1, idempotencyKey: 1 }`.
- **Safe Network Retries**: Replaying the same request returns the original booking without deducting seats twice.
- **Payload Mismatch Protection**: Submitting an existing idempotency key with a different seat count or event returns `409 Conflict`.

### 3. Automatic 10-Minute Reservation Hold & Expiry Worker
- **10-Minute Hold Window**: Bookings are created in `PENDING` status with `expiresAt = Date.now() + 10m`.
- **Distributed Expiry Worker**: Scans expired pending reservations (`status: 'PENDING', expiresAt: { $lte: now }`).
- **Atomic Transition Guarantee**: Exactly-once seat release (`PENDING` $\rightarrow$ `EXPIRED`). Multi-instance safe without distributed deadlocks.
- **No TTL Seat Deletion**: MongoDB TTL deletion is deliberately avoided to preserve financial audit trails.

### 4. Cryptographic Payment Webhooks & Late Payment Policy
- **HMAC SHA-256 Signatures**: Verifies webhooks against the raw binary request payload using constant-time `crypto.timingSafeEqual`.
- **Idempotent Webhook Callbacks**: Duplicate webhooks are acknowledged cleanly (`status: 'already_confirmed'`).
- **Late Payment Protocol**: If payment succeeds after the 10-minute hold has expired and seats are returned, the booking is **never** silently confirmed into an oversold state; it is flagged for refund/reconciliation (`late_payment_refund_required`).

### 5. Authentication & Token Rotation
- **15-Minute JWT Access Tokens**: Signed with unique `jti` to prevent token replay.
- **7-Day Refresh Tokens**: Stored only as SHA-256 hashes (`tokenHash`). Raw tokens are never persisted.
- **Replay & Theft Detection**: Reusing a previously consumed refresh token revokes all active sessions for that user.
- **Secure Cookie Transport**: Sets `HttpOnly`, `SameSite: 'lax'`, `Secure` cookies for web clients with JSON body fallback.

### 6. Administrative Tools & Financial Reporting
- **Event Lifecycle Control**: Admins can create and update events; total seats cannot be reduced below committed inventory.
- **Revenue Aggregation**: `GET /admin/reports/revenue?from=&to=` aggregates confirmed revenue per event per day using stored booking amount snapshots.
- **User-Scoped Rate Limiting**: `POST /bookings` enforces 5 requests/minute per authenticated user, returning `429 Too Many Requests`.
- **Request Tracing & Logging**: UUID `X-Request-Id` injected into every request and structured log line with sensitive data redaction.

### 7. Modern React + Vite Frontend
- **Clean Visual Architecture**: Navy/charcoal typography (`#0f172a`), indigo accents (`#4f46e5`), and responsive card grids.
- **Live Inventory Badges**: Dynamic status indicators (`Available`, `Low Stock`, `Sold Out`).
- **Ticking Hold Countdown**: Real-time timer visualizer for pending bookings.
- **Cursor Pagination**: Infinite-style "Load More" browsing without skip/offset lag.
- **Mock Payment Simulator**: Direct UI trigger for mock webhook verification.

---

## 🛠️ Technology Stack

| Domain | Technologies |
|---|---|
| **Backend** | Node.js (v20+ / v26+), Express 4, TypeScript (Strict Mode), Mongoose 8 |
| **Validation & Security** | Zod, JWT (`jsonwebtoken`), bcrypt, Helmet, CORS, express-rate-limit, cookie-parser |
| **Testing** | Jest 29, Supertest 7, ts-jest |
| **Database** | MongoDB (v7.0+ / v8.0+) with Replica Set transaction capability |
| **Frontend** | React 18, Vite 6, TypeScript (Strict Mode), Axios |
| **Styling** | Modern Responsive CSS (Flexbox, CSS Grid, Custom Properties) |

---

## 📁 Repository Structure

```
Ticketing Tool/
├── package.json                   # Root monorepo workspace orchestration
├── .gitignore                     # Git ignore rules (node_modules, dist, .env)
├── README.md                      # Complete system documentation
├── DECISIONS.md                   # Architectural trade-off analysis
├── backend/
│   ├── package.json               # Backend dependencies & test scripts
│   ├── tsconfig.json              # Strict TypeScript backend configuration
│   ├── jest.config.cjs            # Jest test runner setup
│   ├── .env.example               # Environment variables template
│   ├── src/
│   │   ├── app.ts                 # Express app definition & middleware pipeline
│   │   ├── server.ts              # Server bootstrap & graceful shutdown
│   │   ├── config/
│   │   │   ├── database.ts        # Mongoose connection & lifecycle handlers
│   │   │   ├── env.ts             # Zod environment variable validation
│   │   │   └── swagger.ts         # OpenAPI 3.0 specification & Swagger UI router
│   │   ├── errors/
│   │   │   └── AppError.ts        # Operational error hierarchy
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts # JWT authentication & requireAdmin guards
│   │   │   ├── errorHandler.ts   # Centralized error handler & MongoDB error formatting
│   │   │   ├── notFoundHandler.ts # Standardized 404 handler
│   │   │   ├── rateLimiter.ts     # User-scoped 5 req/min rate limiter
│   │   │   ├── requestId.ts       # UUID X-Request-Id injector
│   │   │   └── validate.ts        # Generic Zod validation middleware
│   │   ├── models/
│   │   │   ├── User.model.ts      # User schema, password hash hiding, unique email
│   │   │   ├── Event.model.ts     # Event schema, text index, date indexes
│   │   │   ├── Booking.model.ts   # Booking schema, unique user+idempotencyKey index
│   │   │   └── RefreshToken.model.ts # SHA-256 token hash & family revocation
│   │   ├── routes/
│   │   │   ├── auth.routes.ts     # Register, login, refresh, logout, me
│   │   │   ├── event.routes.ts    # List events (cursor), get event, create/patch event
│   │   │   ├── booking.routes.ts  # POST /bookings with idempotency & rate limiting
│   │   │   ├── payment.routes.ts  # POST /payments/webhook
│   │   │   ├── admin.routes.ts    # GET /admin/reports/revenue
│   │   │   └── health.routes.ts   # GET /health
│   │   ├── services/
│   │   │   ├── auth.service.ts    # Authentication & atomic refresh rotation logic
│   │   │   ├── event.service.ts   # Event management & cursor-based pagination
│   │   │   ├── booking.service.ts # Atomic conditional booking engine
│   │   │   ├── payment.service.ts # Webhook signature validation & late payment protocol
│   │   │   ├── expiry.worker.ts   # Distributed background seat expiration worker
│   │   │   └── report.service.ts  # MongoDB aggregation pipeline for financial reports
│   │   ├── utils/
│   │   │   ├── crypto.ts          # Random tokens & SHA-256 hash helpers
│   │   │   ├── hmac.ts            # Timing-safe HMAC SHA-256 verification
│   │   │   ├── jwt.ts             # Access token signing with UUID jti
│   │   │   ├── logger.ts          # Structured logger with sensitive key redaction
│   │   │   └── password.ts        # bcrypt hashing & comparison
│   │   └── validators/
│   │       ├── auth.validator.ts
│   │       ├── event.validator.ts
│   │       ├── booking.validator.ts
│   │       ├── payment.validator.ts
│   │       └── report.validator.ts
│   └── tests/
│       ├── health.test.ts
│       ├── models.test.ts
│       ├── auth.test.ts
│       ├── events.test.ts
│       ├── bookings.test.ts
│       ├── payments_and_expiry.test.ts
│       ├── reports_and_reliability.test.ts
│       └── stress_and_concurrency.test.ts # Mandatory 50-parallel request test
└── frontend/
    ├── package.json               # Frontend dependencies (React, Vite, Axios)
    ├── tsconfig.json              # Strict TypeScript client configuration
    ├── vite.config.ts             # Vite configuration with proxy to backend
    ├── index.html                 # HTML entry point
    └── src/
        ├── main.tsx               # Client bootstrap
        ├── App.tsx                # App root & modal coordination
        ├── api/
        │   ├── client.ts          # Axios client with 401 automatic token refresh
        │   ├── auth.api.ts
        │   ├── events.api.ts
        │   └── bookings.api.ts
        ├── context/
        │   └── AuthContext.tsx    # User authentication provider
        ├── components/
        │   ├── Navbar.tsx
        │   ├── EventCard.tsx
        │   ├── BookingModal.tsx   # Idempotent booking flow & mock payment simulator
        │   ├── CountdownTimer.tsx # 10-minute hold visual timer
        │   ├── AuthModal.tsx      # Sign in / registration dialog
        │   ├── Alert.tsx          # Reusable notification banner
        │   ├── SkeletonCard.tsx   # Loading placeholders
        │   └── EmptyState.tsx     # Filter empty placeholder
        ├── pages/
        │   └── EventCatalogPage.tsx # Event catalog, search, date filter & cursor pagination
        └── styles/
            └── index.css          # Navy/indigo responsive design system
```

---

## ⚡ Prerequisites

1. **Node.js**: v18.0.0 or higher (v20+ / v26+ recommended)
2. **npm**: v9.0.0 or higher
3. **MongoDB**: v6.0+ / v7.0+ / v8.0+ running locally on port `27017`

---

## 🚀 Installation & Setup

### 1. Clone & Install Dependencies
```bash
# From project root
npm install
```
*(npm workspaces automatically installs dependencies for both `backend` and `frontend`)*

### 2. Configure Environment Variables
Backend defaults to port `5001` (to prevent conflicts with macOS AirPlay on port `5000`):

```bash
# Backend environment setup
cp backend/.env.example backend/.env

# Frontend environment setup
cp frontend/.env.example frontend/.env
```

**Backend `.env` configuration:**
```env
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/ticket_booking
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=7d
PAYMENT_WEBHOOK_SECRET=webhook_super_secret_shared_hmac_key_2026
CLIENT_ORIGIN=http://localhost:5173
```

---

## 🍃 MongoDB Configuration

The application natively supports both:
1. **Standalone MongoDB**: Uses atomic conditional updates (`availableSeats: { $gte: seats }`) and automatic compensation rollbacks if a subsequent operation fails.
2. **Replica Set MongoDB**: Uses multi-document ACID transactions (`session.startTransaction()`).

### Optional: Enabling Single-Node Replica Set Locally
To enable transactions on local macOS Homebrew MongoDB:
1. Edit `/opt/homebrew/etc/mongod.conf`:
   ```yaml
   replication:
     replSetName: "rs0"
   ```
2. Restart MongoDB:
   ```bash
   brew services restart mongodb-community
   ```
3. Open `mongosh` and initiate the replica set once:
   ```javascript
   rs.initiate()
   ```

---

## 🖥️ Running the Application

### Development Mode (Both Backend & Frontend)
Open two terminal tabs:

**Tab 1: Backend API (port 5001)**
```bash
npm run dev:backend
```

**Tab 2: Frontend Client (port 5173)**
```bash
npm run dev:frontend
```
Open **`http://localhost:5173`** in your browser.

### Production Builds
```bash
# Build backend to dist/
npm run build:backend

# Build frontend to dist/
npm run build:frontend
```

---

## 📚 API Documentation (Swagger & OpenAPI)

Interactive Swagger UI and machine-readable OpenAPI specifications are available out of the box:

- **Swagger UI Interactive Documentation**: [`http://localhost:5001/api-docs`](http://localhost:5001/api-docs)
- **OpenAPI 3.0.3 Specification (JSON)**: [`http://localhost:5001/api-docs.json`](http://localhost:5001/api-docs.json)

The Swagger documentation includes:
- JWT Bearer & HttpOnly cookie authentication controls.
- Full request schemas and examples for Auth, Events, Bookings, Webhooks, and Reports.
- `Idempotency-Key` and `x-signature` header specifications.

---

## 🧪 Automated Testing

### 1. Standalone Live API Test Scripts (Direct HTTP E2E)
Executes typed standalone tests against the live API on `http://localhost:5001`:

```bash
# Run all standalone API test suites in sequence
npm run test:api

# Run individual API test suites
npm run test:api:auth         # Authentication, JWT rotation & session wiping
npm run test:api:events       # Event management & cursor-based pagination
npm run test:api:bookings     # Booking engine, idempotency & rate limits
npm run test:api:payments     # HMAC webhook verification & duplicate delivery
npm run test:api:concurrency  # 50-request parallel anti-overselling stress test
npm run test:api:reports      # Admin revenue aggregation report
```
*See complete documentation in [`docs/API_TESTING_GUIDE.md`](docs/API_TESTING_GUIDE.md).*

### 2. Jest & Supertest Integration Suite
Run the internal Jest test suite (74 tests across 8 suites):

```bash
npm run test:backend
# or from root:
npm test
```

### 3. Strict TypeScript Compilation Check
Verify strict TypeScript compilation across backend, frontend, and API tests:
```bash
npm run typecheck
```

---

## 📡 API Endpoint Reference

### Authentication (`/auth` or `/api/auth`)

| Endpoint | Method | Auth | Body Parameters | Description |
|---|---|---|---|---|
| `/auth/register` | `POST` | Public | `{ name, email, password, role? }` | Creates user, issues 15m access token & 7d refresh token. |
| `/auth/login` | `POST` | Public | `{ email, password }` | Authenticates user, creates session family. |
| `/auth/refresh` | `POST` | Public | `{ refreshToken? }` (or cookie) | Rotates refresh token atomically; revokes all sessions on reuse. |
| `/auth/logout` | `POST` | Public | `{ refreshToken? }` (or cookie) | Revokes token and clears HttpOnly cookie. |
| `/auth/me` | `GET` | Bearer | *None* | Returns authenticated user profile. |

### Event Management (`/events` or `/api/events`)

| Endpoint | Method | Auth | Parameters | Description |
|---|---|---|---|---|
| `/events` | `GET` | Public | `limit`, `cursor`, `search`, `from`, `to` | Cursor-based event listing with search and date filters. |
| `/events/:id` | `GET` | Public | `id` (24-hex ObjectId) | Returns single event details. |
| `/events` | `POST` | Admin | `{ title, description?, date, price, totalSeats }` | Creates event (`availableSeats = totalSeats`). |
| `/events/:id` | `PATCH` | Admin | `{ title?, description?, date?, price?, totalSeats? }` | Updates event; prevents reducing `totalSeats < bookedSeats`. |

### Booking Engine (`/bookings` or `/api/bookings`)

| Endpoint | Method | Auth | Headers | Body Parameters | Description |
|---|---|---|---|---|---|
| `/bookings` | `POST` | User | `Idempotency-Key` | `{ eventId, seats }` | Atomically creates a 10-minute `PENDING` hold. Safe against concurrency. |

### Payment Webhooks (`/payments` or `/api/payments`)

| Endpoint | Method | Auth | Headers | Body Parameters | Description |
|---|---|---|---|---|---|
| `/payments/webhook` | `POST` | Public | `x-signature` (HMAC) | `{ event, bookingId, paymentId, amount }` | Confirms pending bookings; executes Late Payment Protocol. |

### Administration & Reports (`/admin` or `/api/admin`)

| Endpoint | Method | Auth | Query Parameters | Description |
|---|---|---|---|---|
| `/admin/reports/revenue` | `GET` | Admin | `from`, `to` (ISO dates) | Aggregated confirmed revenue per event per day. |

---

## 💻 Example API Requests (cURL)

### 1. Register User
```bash
curl -X POST http://localhost:5001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Cooper", "email": "alice@example.com", "password": "Password123!"}'
```

### 2. Create Event (Admin)
```bash
curl -X POST http://localhost:5001/events \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Summer Jazz Evening",
    "description": "Live jazz under the stars",
    "date": "2026-07-20T19:30:00.000Z",
    "price": 75.0,
    "totalSeats": 100
  }'
```

### 3. Create Booking with Idempotency Key
```bash
curl -X POST http://localhost:5001/bookings \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Idempotency-Key: my-unique-order-uuid-001" \
  -H "Content-Type: application/json" \
  -d '{"eventId": "<EVENT_OBJECT_ID>", "seats": 2}'
```

### 4. Trigger Payment Webhook with HMAC Signature
```bash
# Compute signature: echo -n '{"event":"payment.succeeded","bookingId":"<BOOKING_ID>","paymentId":"pay_123","amount":150}' | openssl dgst -sha256 -hmac "webhook_super_secret_shared_hmac_key_2026"
curl -X POST http://localhost:5001/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-signature: <HMAC_HEX_SIGNATURE>" \
  -d '{"event":"payment.succeeded","bookingId":"<BOOKING_ID>","paymentId":"pay_123","amount":150}'
```

---

## 🔒 Security Best Practices Implemented

1. **Zero Secret Leakage**: Passwords and raw refresh tokens are never returned in responses or output in logs.
2. **Timing Attack Protection**: `crypto.timingSafeEqual` prevents timing side-channels in webhook signature verification.
3. **No Unsafe Read-Then-Write**: All inventory decrements occur in atomic database operations.
4. **Token Family Invalidation**: Replaying any expired or already consumed refresh token immediately revokes all active refresh tokens for that user account.
5. **Rate Limiting**: Defends booking routes against automated bot scalping and brute-force reservation holding.

