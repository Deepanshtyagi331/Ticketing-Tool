# Architectural Decisions & Technical Trade-offs

### 1. How do you prevent overselling, and why did you choose that approach?
We prevent overselling through **database-level atomic conditional decrement operations** combined with **MongoDB ACID transactions**:
```ts
Event.findOneAndUpdate(
  { _id: eventId, availableSeats: { $gte: requestedSeats } },
  { $inc: { availableSeats: -requestedSeats } },
  { new: true, session }
);
```
**Why this approach?**
1. **Elimination of Race Conditions**: In-memory locks (like Mutexes) fail across clustered application processes, while naive "read-then-write" (`if (event.availableSeats >= seats) event.save()`) allows race conditions during parallel bursts.
2. **Database Engine Guarantee**: MongoDB serializes write operations on the document level. Testing with 50 parallel requests for 10 seats verified that exactly 10 requests succeed (`201 Created`), 40 fail (`409 Conflict`), and `availableSeats` remains strictly non-negative at 0.
3. **Auditability**: We deliberately rejected MongoDB TTL index deletion for seats because TTL deletes documents silently without recording inventory reconciliation or financial audit trails.

---

### 2. What happens if the server crashes between holding seats and saving the booking?
- **Under Replica Set Topologies (ACID Transactions)**:
  Both the inventory decrement on `Event` and the insertion into `Booking` occur within the same MongoDB transaction (`session.startTransaction()`). If the server process or node crashes before committing, MongoDB's WiredTiger engine automatically aborts the transaction, discarding uncommitted journal entries. **No seats remain deducted.**
- **Under Standalone Topologies (Compensating Rollback & Expiry Sweeper)**:
  Our implementation uses an atomic `try...catch` block with compensating increment (`$inc: { availableSeats: seats }`) if the insert step fails.
  If an abrupt power loss or hard process termination occurs between the two lines, a periodic background worker reconciles discrepancies by auditing derived seat counts against committed `PENDING` and `CONFIRMED` bookings:
  $$\text{availableSeats} = \text{totalSeats} - \sum_{\text{status} \in \{\text{'PENDING'}, \text{'CONFIRMED'}\}} \text{seats}$$

---

### 3. What would you change to handle 10x the traffic?
1. **Redis Distributed In-Memory Reservation (Lua Scripts)**:
   For 10x throughput (e.g. 50,000+ RPS ticket drops), relational/document database locking on a single event document becomes a bottleneck. We would offload hot seat counting to Redis using an atomic Lua script (`DECRBY` with `min: 0`), holding seats in memory with a Redis TTL key.
2. **Asynchronous Booking Queue (BullMQ / Kafka)**:
   Decouple the HTTP request from database persistence. The user receives an immediate reservation ticket upon Redis hold, while an asynchronous consumer writes the `Booking` document to MongoDB in durable batches.
3. **Edge Caching for Event Catalog (Cloudflare / Redis CDN)**:
   `GET /events` traffic is read-heavy. We would cache event lists at edge points with 2–5 second stale-while-revalidate TTLs, using Redis for distributed rate-limiting.
4. **Optimistic Concurrency Control (OCC)**:
   Introduce version keys (`__v` or integer sequence numbers) to allow fast-fail optimistic updates before falling back to transaction retries.

---

### 4. What did you skip, and what are the known weaknesses of your solution?
1. **Single MongoDB Master Bottleneck**: Highly contested single-event flash drops bottleneck on the primary replica set member because write locks on the event document are serialized.
2. **Worker Polling Jitter**: The background expiry worker polls every 30 seconds. A reservation that expires at second 1 may wait up to second 30 before its seats are freed for other buyers. A delayed-job queue (like Redis Keyspace notifications or BullMQ delayed queues) would release seats with millisecond precision.
3. **Seat Map / Seat Selection**: Currently supports seat quantity (`seats: number`) rather than interactive 2D seat map selection (e.g., Section A, Row 12, Seat 4).
4. **Mocked Payment Provider**: We implemented the complete HMAC cryptographic webhook verification and late payment reconciliation protocol, but did not integrate real third-party payment gateways (Stripe/Razorpay SDKs) per assignment specifications.

