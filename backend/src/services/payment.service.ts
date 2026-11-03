import { Booking } from '../models/Booking.model.js';
import { Event } from '../models/Event.model.js';
import { ExpiryWorker } from './expiry.worker.js';
import { verifyHmac } from '../utils/hmac.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import type { PaymentWebhookInput } from '../validators/payment.validator.js';

export interface WebhookProcessingResult {
  status:
    | 'confirmed'
    | 'already_confirmed'
    | 'late_payment_refund_required'
    | 'payment_failed_seats_released';
  message: string;
  bookingId: string;
  paymentId: string;
  amount?: number;
}

export class PaymentService {
  /**
   * Processes incoming payment provider webhooks with HMAC validation,
   * idempotent confirmation, late-payment detection, and concurrency control.
   */
  public static async processWebhook(
    rawBody: Buffer | string | undefined,
    signature: string | undefined,
    input: PaymentWebhookInput
  ): Promise<WebhookProcessingResult> {
    // 1. Verify HMAC cryptographic signature against the exact raw request payload
    if (!signature) {
      throw AppError.unauthorized('Webhook signature header is missing');
    }

    if (!rawBody) {
      throw AppError.badRequest('Raw request body is required for HMAC signature verification');
    }

    const isValid = verifyHmac(rawBody, signature, env.PAYMENT_WEBHOOK_SECRET);
    if (!isValid) {
      throw AppError.unauthorized('Invalid webhook HMAC signature');
    }

    const now = new Date();

    // 2. Handle Payment Failure
    if (input.event === 'payment.failed') {
      const failedBooking = await Booking.findOneAndUpdate(
        {
          _id: input.bookingId,
          status: 'PENDING'
        },
        {
          $set: { status: 'EXPIRED' }
        },
        { new: true }
      );

      if (failedBooking) {
        // Release reserved seats back to inventory
        await Event.updateOne(
          { _id: failedBooking.eventId },
          { $inc: { availableSeats: failedBooking.seats } }
        );
      }

      return {
        status: 'payment_failed_seats_released',
        message: 'Payment failed. Reservation cancelled and seats released.',
        bookingId: input.bookingId,
        paymentId: input.paymentId
      };
    }

    // 3. Handle Payment Succeeded: Atomic conditional transition (PENDING -> CONFIRMED)
    // Guarantees we only confirm if status is currently PENDING AND expiration date is in the future.
    const confirmedBooking = await Booking.findOneAndUpdate(
      {
        _id: input.bookingId,
        status: 'PENDING',
        expiresAt: { $gt: now }
      },
      {
        $set: { status: 'CONFIRMED' }
      },
      { new: true }
    );

    if (confirmedBooking) {
      return {
        status: 'confirmed',
        message: 'Payment successfully processed and booking confirmed.',
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        amount: input.amount
      };
    }

    // 4. Inspection of non-pending / expired booking
    const existingBooking = await Booking.findById(input.bookingId);
    if (!existingBooking) {
      throw AppError.notFound(`Booking with ID ${input.bookingId} not found`);
    }

    // Duplicate webhook: Already confirmed
    if (existingBooking.status === 'CONFIRMED') {
      return {
        status: 'already_confirmed',
        message: 'Booking was previously confirmed. Duplicate webhook acknowledged.',
        bookingId: input.bookingId,
        paymentId: input.paymentId
      };
    }

    // LATE PAYMENT POLICY:
    // If payment succeeds after the 10-minute window has elapsed or seats were already released,
    // do not confirm the booking. Ensure seats are marked released and flag for refund/reconciliation.
    if (existingBooking.status === 'PENDING' && existingBooking.expiresAt <= now) {
      // Ensure seats are released immediately if not yet swept by worker
      await ExpiryWorker.expireSingleBooking(input.bookingId);
    }

    console.warn(
      `⚠️ [PaymentService] Late payment received for booking ${input.bookingId} (paymentId: ${input.paymentId}). Status is ${existingBooking.status}. Refund required.`
    );

    return {
      status: 'late_payment_refund_required',
      message:
        'Late payment received after booking expiration. Seats were released and cannot be guaranteed. A refund or manual reconciliation has been initiated.',
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      amount: input.amount
    };
  }
}

