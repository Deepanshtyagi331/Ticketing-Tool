import mongoose, { Types } from 'mongoose';
import { User, Event, Booking, RefreshToken } from '../src/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/ticket_booking_test';

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  // Ensure indexes are built
  await Promise.all([
    User.syncIndexes(),
    Event.syncIndexes(),
    Booking.syncIndexes(),
    RefreshToken.syncIndexes()
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    Booking.deleteMany({}),
    RefreshToken.deleteMany({})
  ]);
});

describe('User Model', () => {
  it('should create a valid user and hash should not be exposed in toJSON', async () => {
    const user = await User.create({
      name: 'John Doe',
      email: 'john@example.com',
      passwordHash: 'hashed_secret_password',
      role: 'user'
    });

    expect(user._id).toBeDefined();
    expect(user.email).toBe('john@example.com');
    expect(user.role).toBe('user');

    const json = user.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.__v).toBeUndefined();
  });

  it('should enforce unique email constraint', async () => {
    await User.create({
      name: 'User 1',
      email: 'unique@example.com',
      passwordHash: 'hash1',
      role: 'user'
    });

    await expect(
      User.create({
        name: 'User 2',
        email: 'unique@example.com',
        passwordHash: 'hash2',
        role: 'user'
      })
    ).rejects.toThrow();
  });

  it('should reject invalid role', async () => {
    await expect(
      User.create({
        name: 'Invalid Role',
        email: 'invalid@example.com',
        passwordHash: 'hash',
        role: 'superadmin' as any
      })
    ).rejects.toThrow();
  });
});

describe('Event Model', () => {
  it('should create a valid event', async () => {
    const event = await Event.create({
      title: 'Rock Festival 2026',
      description: 'The biggest outdoor music festival',
      date: new Date(Date.now() + 86400000),
      price: 150,
      totalSeats: 500,
      availableSeats: 500
    });

    expect(event._id).toBeDefined();
    expect(event.price).toBe(150);
    expect(event.totalSeats).toBe(500);
    expect(event.availableSeats).toBe(500);
  });

  it('should reject negative price', async () => {
    await expect(
      Event.create({
        title: 'Negative Price Event',
        date: new Date(Date.now() + 86400000),
        price: -10,
        totalSeats: 100,
        availableSeats: 100
      })
    ).rejects.toThrow();
  });

  it('should reject availableSeats exceeding totalSeats', async () => {
    await expect(
      Event.create({
        title: 'Overbooked Event',
        date: new Date(Date.now() + 86400000),
        price: 50,
        totalSeats: 100,
        availableSeats: 105
      })
    ).rejects.toThrow();
  });
});

describe('Booking Model', () => {
  it('should enforce idempotency uniqueness per user', async () => {
    const userId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const idempotencyKey = 'order-req-abc-123';

    await Booking.create({
      userId,
      eventId,
      seats: 2,
      amount: 100,
      status: 'PENDING',
      idempotencyKey,
      expiresAt: new Date(Date.now() + 600000)
    });

    // Attempting same idempotencyKey for same user must fail
    await expect(
      Booking.create({
        userId,
        eventId,
        seats: 2,
        amount: 100,
        status: 'PENDING',
        idempotencyKey,
        expiresAt: new Date(Date.now() + 600000)
      })
    ).rejects.toThrow();

    // But a different user with the same idempotency key is permitted
    const otherUserBooking = await Booking.create({
      userId: new Types.ObjectId(),
      eventId,
      seats: 2,
      amount: 100,
      status: 'PENDING',
      idempotencyKey,
      expiresAt: new Date(Date.now() + 600000)
    });
    expect(otherUserBooking._id).toBeDefined();
  });

  it('should query expired bookings efficiently', async () => {
    const userId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const pastDate = new Date(Date.now() - 1000);

    await Booking.create({
      userId,
      eventId,
      seats: 1,
      amount: 50,
      status: 'PENDING',
      idempotencyKey: 'idemp-expired',
      expiresAt: pastDate
    });

    const expired = await Booking.find({
      status: 'PENDING',
      expiresAt: { $lte: new Date() }
    });

    expect(expired.length).toBe(1);
    expect(expired[0]?.idempotencyKey).toBe('idemp-expired');
  });
});

describe('RefreshToken Model', () => {
  it('should store tokenHash and enforce unique tokenHash', async () => {
    const userId = new Types.ObjectId();
    const tokenHash = 'sha256_mock_hash_12345';
    const familyId = 'family-session-001';

    const tokenDoc = await RefreshToken.create({
      userId,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + 7 * 86400000)
    });

    expect(tokenDoc._id).toBeDefined();
    expect(tokenDoc.isRevoked).toBe(false);
    expect(tokenDoc.isUsed).toBe(false);

    // Duplicate hash should fail
    await expect(
      RefreshToken.create({
        userId,
        tokenHash,
        familyId: 'family-session-002',
        expiresAt: new Date(Date.now() + 7 * 86400000)
      })
    ).rejects.toThrow();
  });
});
