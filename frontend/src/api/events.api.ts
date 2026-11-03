import { apiClient } from './client';
import type { ApiResponse, EventsResponseData, EventItem } from '../types';

export interface EventQueryParams {
  limit?: number;
  cursor?: string;
  search?: string;
  from?: string;
  to?: string;
}

export const eventsApi = {
  async getEvents(params: EventQueryParams = {}): Promise<EventsResponseData> {
    const cleanParams: Record<string, string | number> = {};
    if (params.limit) cleanParams.limit = params.limit;
    if (params.cursor) cleanParams.cursor = params.cursor;
    if (params.search?.trim()) cleanParams.search = params.search.trim();
    if (params.from) cleanParams.from = params.from;
    if (params.to) cleanParams.to = params.to;

    const res = await apiClient.get<ApiResponse<EventsResponseData>>('/events', {
      params: cleanParams
    });
    return res.data.data!;
  },

  async getEventById(id: string): Promise<EventItem> {
    const res = await apiClient.get<ApiResponse<{ event: EventItem }>>(`/events/${id}`);
    return res.data.data!.event;
  }
};

