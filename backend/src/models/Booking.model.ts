import { Schema, model, Document, Types } from 'mongoose';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED';

export interface IBooking {
  userId: Types.ObjectId;
  eventId: Types.ObjectId;
  seats: number;
  amount: number;
  status: BookingStatus;
  idempotencyKey: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBookingDocument extends IBooking, Document<Types.ObjectId> {}

const bookingSchema = new Schema<IBookingDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required']
    },
    seats: {
      type: Number,
      required: [true, 'Number of seats is required'],
      min: [1, 'Must book at least 1 seat'],
      validate: {
        validator: Number.isInteger,
        message: 'Seats must be an integer'
      }
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'CONFIRMED', 'EXPIRED'],
        message: '{VALUE} is not a valid booking status'
      },
      default: 'PENDING'
    },
    idempotencyKey: {
      type: String,
      required: [true, 'Idempotency key is required'],
      trim: true
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration timestamp is required']
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes
// 1. Idempotency uniqueness per user (prevents duplicate bookings from retry/concurrent requests)
bookingSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, name: 'user_idempotency_unique_idx' });

// 2. Querying pending bookings that have expired (for explicit seat release worker / transaction)
// NOTE: TTL deletion index is deliberately NOT used here so booking history is preserved and seats are released explicitly.
bookingSchema.index({ status: 1, expiresAt: 1 }, { name: 'booking_expiration_query_idx' });

// 3. User bookings history queries
bookingSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_bookings_history_idx' });

// 4. Revenue aggregation index by event
bookingSchema.index({ eventId: 1, status: 1, amount: 1 }, { name: 'event_revenue_aggregation_idx' });

// 5. Global revenue aggregation by time period and status
bookingSchema.index({ status: 1, createdAt: 1, amount: 1 }, { name: 'global_revenue_aggregation_idx' });

export const Booking = model<IBookingDocument>('Booking', bookingSchema);
