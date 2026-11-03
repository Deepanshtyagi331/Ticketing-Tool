import { Booking, IBookingDocument } from '../models/Booking.model.js';
import { Event } from '../models/Event.model.js';

export interface ExpiryResult {
  processedCount: number;
  expiredBookingIds: string[];
  seatsReleased: number;
}

export class ExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  /**
   * Atomically expires a single booking and releases its seats exactly once.
   * Guarantees that only a successful transition from PENDING to EXPIRED triggers seat release.
   */
  public static async expireSingleBooking(
    bookingId: string
  ): Promise<{ success: boolean; seatsReleased: number }> {
    const now = new Date();

    // Atomic conditional transition: PENDING -> EXPIRED
    const expiredBooking: IBookingDocument | null = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: 'PENDING',
        expiresAt: { $lte: now }
      },
      {
        $set: { status: 'EXPIRED' }
      },
      { new: true }
    );

    // If null, the booking either:
    // - was already confirmed by payment
    // - was already expired by another worker thread
    // - has not expired yet
    if (!expiredBooking) {
      return { success: false, seatsReleased: 0 };
    }

    // Exactly-once seat restoration
    await Event.updateOne(
      { _id: expiredBooking.eventId },
      { $inc: { availableSeats: expiredBooking.seats } }
    );

    console.log(
      `⏱️ [ExpiryWorker] Expired booking ${expiredBooking._id}: released ${expiredBooking.seats} seats back to event ${expiredBooking.eventId}`
    );

    return { success: true, seatsReleased: expiredBooking.seats };
  }

  /**
   * Scans for a batch of expired PENDING bookings and processes each atomically.
   * Safe across multiple clustered instances running simultaneously.
   */
  public static async processExpiredBookings(batchSize: number = 50): Promise<ExpiryResult> {
    const now = new Date();

    // Query expired pending candidates using compound index { status: 1, expiresAt: 1 }
    const candidates = await Booking.find(
      {
        status: 'PENDING',
        expiresAt: { $lte: now }
      },
      { _id: 1 }
    )
      .limit(batchSize)
      .lean();

    const expiredBookingIds: string[] = [];
    let seatsReleased = 0;

    for (const candidate of candidates) {
      const result = await ExpiryWorker.expireSingleBooking(candidate._id.toString());
      if (result.success) {
        expiredBookingIds.push(candidate._id.toString());
        seatsReleased += result.seatsReleased;
      }
    }

    return {
      processedCount: candidates.length,
      expiredBookingIds,
      seatsReleased
    };
  }

  /**
   * Starts periodic polling in background.
   */
  public start(intervalMs: number = 30000): void {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      try {
        await ExpiryWorker.processExpiredBookings();
      } catch (err) {
        console.error('❌ [ExpiryWorker] Error during expiration cycle:', err);
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);

    // Allow process to exit naturally without waiting for interval
    this.timer.unref();
    console.log(`⏱️ [ExpiryWorker] Background expiry worker started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stops periodic polling.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🛑 [ExpiryWorker] Background expiry worker stopped');
    }
  }
}

export const expiryWorkerInstance = new ExpiryWorker();

