import mongoose, { Types } from 'mongoose';
import { Event } from '../models/Event.model.js';
import { Booking, IBookingDocument, BookingStatus } from '../models/Booking.model.js';
import { AppError } from '../errors/AppError.js';

const TEN_MINUTES_MS = 10 * 60 * 1000;

export interface BookingResponseData {
  id: string;
  eventId: string;
  userId: string;
  seats: number;
  amount: number;
  status: BookingStatus;
  idempotencyKey: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingResult {
  booking: BookingResponseData;
  isRetry: boolean;
}

function formatBookingResponse(doc: IBookingDocument): BookingResponseData {
  return {
    id: doc._id.toString(),
    eventId: doc.eventId.toString(),
    userId: doc.userId.toString(),
    seats: doc.seats,
    amount: doc.amount,
    status: doc.status,
    idempotencyKey: doc.idempotencyKey,
    expiresAt: doc.expiresAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}

let cachedSupportsTransactions: boolean | null = null;

async function checkTransactionSupport(): Promise<boolean> {
  if (cachedSupportsTransactions !== null) {
    return cachedSupportsTransactions;
  }
  try {
    const isMaster = await mongoose.connection.db?.admin().command({ hello: 1 });
    cachedSupportsTransactions = Boolean(isMaster?.setName);
    return cachedSupportsTransactions;
  } catch {
    cachedSupportsTransactions = false;
    return false;
  }
}

export class BookingService {
  /**
   * Concurrency-safe ticket booking with strict idempotency and atomic conditional inventory updates.
   * Supports multi-document ACID transactions on replica sets, with atomic conditional compensation on standalone MongoDB.
   */
  public static async createBooking(
    userId: string,
    eventId: string,
    seats: number,
    idempotencyKey: string
  ): Promise<CreateBookingResult> {
    // 1. Fast pre-flight check for existing idempotency key
    const existing = await Booking.findOne({ userId, idempotencyKey });
    if (existing) {
      const sameEvent = existing.eventId.toString() === eventId;
      const sameSeats = existing.seats === seats;

      if (!sameEvent || !sameSeats) {
        throw AppError.conflict(
          'Idempotency key was already used with a different booking payload (different event or seat count)'
        );
      }

      return {
        booking: formatBookingResponse(existing),
        isRetry: true
      };
    }

    const supportsTxn = await checkTransactionSupport();

    if (supportsTxn) {
      return BookingService.createBookingWithTransaction(userId, eventId, seats, idempotencyKey);
    } else {
      return BookingService.createBookingAtomic(userId, eventId, seats, idempotencyKey);
    }
  }

  /**
   * Execution on Replica Set topologies using native multi-document ACID transactions.
   */
  private static async createBookingWithTransaction(
    userId: string,
    eventId: string,
    seats: number,
    idempotencyKey: string
  ): Promise<CreateBookingResult> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const event = await Event.findById(eventId).session(session);
      if (!event) {
        throw AppError.notFound(`Event with ID ${eventId} not found`);
      }

      const updatedEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          availableSeats: { $gte: seats }
        },
        {
          $inc: { availableSeats: -seats }
        },
        {
          new: true,
          session
        }
      );

      if (!updatedEvent) {
        throw AppError.conflict(
          `Insufficient seats available. Requested: ${seats}, currently available: ${event.availableSeats}`
        );
      }

      const amount = updatedEvent.price * seats;
      const expiresAt = new Date(Date.now() + TEN_MINUTES_MS);

      const [booking] = await Booking.create(
        [
          {
            userId: new Types.ObjectId(userId),
            eventId: new Types.ObjectId(eventId),
            seats,
            amount,
            status: 'PENDING',
            idempotencyKey,
            expiresAt
          }
        ],
        { session }
      );

      if (!booking) {
        throw AppError.internal('Failed to create booking record');
      }

      await session.commitTransaction();

      return {
        booking: formatBookingResponse(booking),
        isRetry: false
      };
    } catch (error: unknown) {
      await session.abortTransaction();

      const err = error as { code?: number; message?: string };
      if (err.code === 11000 || err.message?.includes('E11000')) {
        const concurrentBooking = await Booking.findOne({ userId, idempotencyKey });
        if (concurrentBooking) {
          const sameEvent = concurrentBooking.eventId.toString() === eventId;
          const sameSeats = concurrentBooking.seats === seats;

          if (!sameEvent || !sameSeats) {
            throw AppError.conflict(
              'Idempotency key was already used with a different booking payload'
            );
          }

          return {
            booking: formatBookingResponse(concurrentBooking),
            isRetry: true
          };
        }
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Execution on Standalone MongoDB topologies using atomic conditional operations with rollback compensation.
   */
  private static async createBookingAtomic(
    userId: string,
    eventId: string,
    seats: number,
    idempotencyKey: string
  ): Promise<CreateBookingResult> {
    // 1. Verify event exists
    const event = await Event.findById(eventId);
    if (!event) {
      throw AppError.notFound(`Event with ID ${eventId} not found`);
    }

    // 2. Atomic conditional decrement: only succeeds if availableSeats >= seats
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        availableSeats: { $gte: seats }
      },
      {
        $inc: { availableSeats: -seats }
      },
      {
        new: true
      }
    );

    if (!updatedEvent) {
      throw AppError.conflict(
        `Insufficient seats available. Requested: ${seats}, currently available: ${event.availableSeats}`
      );
    }

    const amount = updatedEvent.price * seats;
    const expiresAt = new Date(Date.now() + TEN_MINUTES_MS);

    // 3. Insert PENDING booking
    try {
      const booking = await Booking.create({
        userId: new Types.ObjectId(userId),
        eventId: new Types.ObjectId(eventId),
        seats,
        amount,
        status: 'PENDING',
        idempotencyKey,
        expiresAt
      });

      return {
        booking: formatBookingResponse(booking),
        isRetry: false
      };
    } catch (error: unknown) {
      // Rollback the decremented inventory immediately
      await Event.updateOne({ _id: eventId }, { $inc: { availableSeats: seats } });

      const err = error as { code?: number; message?: string };
      if (err.code === 11000 || err.message?.includes('E11000')) {
        const concurrentBooking = await Booking.findOne({ userId, idempotencyKey });
        if (concurrentBooking) {
          const sameEvent = concurrentBooking.eventId.toString() === eventId;
          const sameSeats = concurrentBooking.seats === seats;

          if (!sameEvent || !sameSeats) {
            throw AppError.conflict(
              'Idempotency key was already used with a different booking payload'
            );
          }

          return {
            booking: formatBookingResponse(concurrentBooking),
            isRetry: true
          };
        }
      }

      throw error;
    }
  }
}
