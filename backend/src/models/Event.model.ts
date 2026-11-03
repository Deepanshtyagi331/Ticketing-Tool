import { Schema, model, Document, Types } from 'mongoose';

export interface IEvent {
  title: string;
  description?: string;
  date: Date;
  price: number;
  totalSeats: number;
  availableSeats: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEventDocument extends IEvent, Document<Types.ObjectId> {}

const eventSchema = new Schema<IEventDocument>(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters long'],
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: ''
    },
    date: {
      type: Date,
      required: [true, 'Event date and time is required']
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    },
    totalSeats: {
      type: Number,
      required: [true, 'Total seats count is required'],
      min: [1, 'Total seats must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Total seats must be an integer'
      }
    },
    availableSeats: {
      type: Number,
      required: [true, 'Available seats count is required'],
      min: [0, 'Available seats cannot be negative'],
      validate: [
        {
          validator: Number.isInteger,
          message: 'Available seats must be an integer'
        },
        {
          validator: function (this: IEventDocument, val: number) {
            // Validate that availableSeats cannot exceed totalSeats
            return val <= this.totalSeats;
          },
          message: 'Available seats ({VALUE}) cannot exceed total seats'
        }
      ]
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
// 1. Text search index on title and description
eventSchema.index(
  { title: 'text', description: 'text' },
  { weights: { title: 10, description: 5 }, name: 'event_text_search_idx' }
);

// 2. Chronological sorting and cursor pagination
eventSchema.index({ date: 1, _id: 1 }, { name: 'event_date_cursor_idx' });

// 3. Compound index for querying upcoming events with ticket availability
eventSchema.index({ date: 1, availableSeats: 1 }, { name: 'event_date_availability_idx' });

export const Event = model<IEventDocument>('Event', eventSchema);
