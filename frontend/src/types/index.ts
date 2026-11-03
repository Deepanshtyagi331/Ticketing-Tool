export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface EventItem {
  _id: string;
  title: string;
  description?: string;
  date: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED';

export interface Booking {
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

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface EventsResponseData {
  events: EventItem[];
  pagination: PaginationMeta;
}

export interface AuthResponseData {
  user: User;
  accessToken: string;
  refreshToken?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: 'UP' | 'DEGRADED';
  timestamp: string;
  uptime: number;
  database: {
    status: string;
    readyState: number;
  };
  system: {
    nodeVersion: string;
  };
}
