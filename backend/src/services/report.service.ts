import { Booking } from '../models/Booking.model.js';
import type { PipelineStage } from 'mongoose';

export interface EventDailyRevenueItem {
  eventId: string;
  eventTitle: string;
  date: string;
  totalRevenue: number;
  confirmedBookingsCount: number;
  totalSeatsSold: number;
}

export interface RevenueReportResult {
  report: EventDailyRevenueItem[];
  summary: {
    totalRevenue: number;
    totalBookings: number;
    totalSeats: number;
    from: string;
    to: string;
  };
}

export class ReportService {
  /**
   * Generates confirmed revenue report aggregated per event per day.
   * Only includes CONFIRMED bookings and uses the stored booking amount as financial truth.
   */
  public static async getRevenueReport(from: Date, to: Date): Promise<RevenueReportResult> {
    const pipeline: PipelineStage[] = [
      // 1. Filter: Only CONFIRMED bookings within the requested datetime window
      {
        $match: {
          status: 'CONFIRMED',
          createdAt: {
            $gte: from,
            $lte: to
          }
        }
      },
      // 2. Lookup event details
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'event'
        }
      },
      // 3. Unwind event array
      {
        $unwind: '$event'
      },
      // 4. Group by event identity and calendar date (YYYY-MM-DD)
      {
        $group: {
          _id: {
            eventId: '$eventId',
            eventTitle: '$event.title',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            }
          },
          totalRevenue: { $sum: '$amount' },
          confirmedBookingsCount: { $sum: 1 },
          totalSeatsSold: { $sum: '$seats' }
        }
      },
      // 5. Project into clean reporting schema
      {
        $project: {
          _id: 0,
          eventId: { $toString: '$_id.eventId' },
          eventTitle: '$_id.eventTitle',
          date: '$_id.date',
          totalRevenue: 1,
          confirmedBookingsCount: 1,
          totalSeatsSold: 1
        }
      },
      // 6. Sort chronologically, then by highest revenue
      {
        $sort: {
          date: 1,
          totalRevenue: -1
        }
      }
    ];

    const report = await Booking.aggregate<EventDailyRevenueItem>(pipeline);

    // Compute summary totals
    const totalRevenue = report.reduce((sum, item) => sum + item.totalRevenue, 0);
    const totalBookings = report.reduce((sum, item) => sum + item.confirmedBookingsCount, 0);
    const totalSeats = report.reduce((sum, item) => sum + item.totalSeatsSold, 0);

    return {
      report,
      summary: {
        totalRevenue,
        totalBookings,
        totalSeats,
        from: from.toISOString(),
        to: to.toISOString()
      }
    };
  }
}

