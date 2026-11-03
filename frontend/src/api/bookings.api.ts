import { apiClient } from './client';
import type { ApiResponse, Booking } from '../types';

export interface CreateBookingResponse {
  booking: Booking;
  isRetry: boolean;
}

export const bookingsApi = {
  async createBooking(
    eventId: string,
    seats: number,
    idempotencyKey: string
  ): Promise<CreateBookingResponse> {
    const res = await apiClient.post<ApiResponse<CreateBookingResponse>>(
      '/bookings',
      {
        eventId,
        seats
      },
      {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      }
    );
    return res.data.data!;
  }
};

