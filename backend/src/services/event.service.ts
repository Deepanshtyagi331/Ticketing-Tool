import { Types, FilterQuery } from 'mongoose';
import { Event, IEventDocument } from '../models/Event.model.js';
import { AppError } from '../errors/AppError.js';
import type {
  CreateEventInput,
  UpdateEventInput,
  ListEventsQuery
} from '../validators/event.validator.js';

interface CursorPayload {
  date: string;
  id: string;
}

export interface ListEventsResult {
  events: IEventDocument[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export class EventService {
  /**
   * Admin: Create a new event.
   * availableSeats initially matches totalSeats.
   */
  public static async createEvent(input: CreateEventInput): Promise<IEventDocument> {
    const event = await Event.create({
      title: input.title,
      description: input.description,
      date: input.date,
      price: input.price,
      totalSeats: input.totalSeats,
      availableSeats: input.totalSeats // Guarantees availableSeats starts equal to totalSeats
    });

    return event;
  }

  /**
   * Admin: Update event details and adjust inventory safely.
   * Ensures totalSeats cannot be reduced below already committed/reserved inventory.
   */
  public static async updateEvent(id: string, input: UpdateEventInput): Promise<IEventDocument> {
    const event = await Event.findById(id);
    if (!event) {
      throw AppError.notFound(`Event with ID ${id} not found`);
    }

    if (input.title !== undefined) event.title = input.title;
    if (input.description !== undefined) event.description = input.description;
    if (input.date !== undefined) event.date = input.date;
    if (input.price !== undefined) event.price = input.price;

    if (input.totalSeats !== undefined) {
      const bookedSeats = event.totalSeats - event.availableSeats;

      if (input.totalSeats < bookedSeats) {
        throw AppError.badRequest(
          `Cannot reduce total seats to ${input.totalSeats}. There are currently ${bookedSeats} seats booked or reserved.`
        );
      }

      const seatDelta = input.totalSeats - event.totalSeats;
      event.totalSeats = input.totalSeats;
      event.availableSeats = event.availableSeats + seatDelta;
    }

    await event.save();
    return event;
  }

  /**
   * Public: Retrieve single event by ID.
   */
  public static async getEventById(id: string): Promise<IEventDocument> {
    const event = await Event.findById(id);
    if (!event) {
      throw AppError.notFound(`Event with ID ${id} not found`);
    }
    return event;
  }

  /**
   * Public: List events with cursor-based pagination, date-range filtering, and text search.
   * No skip() or offset pagination used.
   */
  public static async listEvents(query: ListEventsQuery): Promise<ListEventsResult> {
    const limit = query.limit;
    const conditions: FilterQuery<IEventDocument>[] = [];

    // 1. Date Range Filtering
    if (query.from || query.to) {
      const dateFilter: Record<string, Date> = {};
      if (query.from) dateFilter.$gte = query.from;
      if (query.to) dateFilter.$lte = query.to;
      conditions.push({ date: dateFilter });
    }

    // 2. Title Text Search using MongoDB text index
    if (query.search && query.search.trim().length > 0) {
      conditions.push({ $text: { $search: query.search.trim() } });
    }

    // 3. Cursor Pagination Filter
    if (query.cursor) {
      let parsedCursor: CursorPayload;
      try {
        const decoded = Buffer.from(query.cursor, 'base64').toString('utf-8');
        parsedCursor = JSON.parse(decoded) as CursorPayload;

        if (!parsedCursor.date || !parsedCursor.id || !Types.ObjectId.isValid(parsedCursor.id)) {
          throw new Error('Malformed cursor fields');
        }
      } catch {
        throw AppError.badRequest('Invalid pagination cursor format');
      }

      const cursorDate = new Date(parsedCursor.date);
      if (isNaN(cursorDate.getTime())) {
        throw AppError.badRequest('Invalid date in pagination cursor');
      }

      const cursorId = new Types.ObjectId(parsedCursor.id);

      // Stable compound cursor ordering: { date: 1, _id: 1 }
      conditions.push({
        $or: [
          { date: { $gt: cursorDate } },
          { date: cursorDate, _id: { $gt: cursorId } }
        ]
      });
    }

    const filter: FilterQuery<IEventDocument> =
      conditions.length > 0 ? { $and: conditions } : {};

    // Fetch limit + 1 items to determine hasMore
    const events = await Event.find(filter)
      .sort({ date: 1, _id: 1 })
      .limit(limit + 1);

    const hasMore = events.length > limit;
    const results = hasMore ? events.slice(0, limit) : events;

    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const last = results[results.length - 1];
      if (last) {
        const payload: CursorPayload = {
          date: last.date.toISOString(),
          id: last._id.toString()
        };
        nextCursor = Buffer.from(JSON.stringify(payload)).toString('base64');
      }
    }

    return {
      events: results,
      pagination: {
        nextCursor,
        hasMore,
        limit
      }
    };
  }
}
