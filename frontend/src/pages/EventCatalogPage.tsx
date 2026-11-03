import React, { useState, useEffect, useCallback } from 'react';
import { eventsApi } from '../api/events.api';
import { EventCard } from '../components/EventCard';
import { SkeletonCard } from '../components/SkeletonCard';
import { EmptyState } from '../components/EmptyState';
import { Alert } from '../components/Alert';
import { BookingModal } from '../components/BookingModal';
import type { EventItem, PaginationMeta } from '../types';

interface EventCatalogPageProps {
  onOpenAuth: () => void;
}

export const EventCatalogPage: React.FC<EventCatalogPageProps> = ({ onOpenAuth }) => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    nextCursor: null,
    hasMore: false,
    limit: 6
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Selected event for booking modal
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const fetchInitialEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await eventsApi.getEvents({
        limit: 6,
        search: search.trim() || undefined,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(toDate).toISOString() : undefined
      });

      setEvents(data.events);
      setPagination(data.pagination);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setError(errObj.message || 'Failed to load events. Please check your network connection.');
    } finally {
      setIsLoading(false);
    }
  }, [search, fromDate, toDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchInitialEvents();
    }, 250);

    return () => clearTimeout(timer);
  }, [fetchInitialEvents]);

  const handleLoadMore = async () => {
    if (!pagination.nextCursor || isLoadingMore) return;

    try {
      setIsLoadingMore(true);
      const data = await eventsApi.getEvents({
        limit: 6,
        cursor: pagination.nextCursor,
        search: search.trim() || undefined,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(toDate).toISOString() : undefined
      });

      setEvents((prev) => [...prev, ...data.events]);
      setPagination(data.pagination);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setError(errObj.message || 'Failed to load additional events.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="container">
      {/* Hero Header */}
      <section className="hero-section">
        <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.6rem', letterSpacing: '-0.02em' }}>
          Discover & Book Extraordinary Experiences
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: '640px', margin: '0 auto' }}>
          Real-time availability, atomic seat holds, and instant confirmations for premier concerts, theater, and sports.
        </p>

        {/* Filter / Search Bar */}
        <div className="filter-bar">
          <div style={{ flex: 2, minWidth: '220px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
              Search Event Title
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Rock, Symphony, Festival..."
              className="input-field"
            />
          </div>

          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="input-field"
            />
          </div>

          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="input-field"
            />
          </div>

          {(search || fromDate || toDate) && (
            <div style={{ alignSelf: 'flex-end' }}>
              <button onClick={handleClearFilters} className="btn btn-outline" style={{ height: '42px', whiteSpace: 'nowrap' }}>
                Reset
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <Alert
          type="error"
          title="Error Loading Events"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Event Cards Grid */}
      {isLoading ? (
        <div className="event-grid">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          title="No Matching Events Found"
          description="We couldn't find any events matching your search or date filters."
          actionLabel="Clear Filters"
          onAction={handleClearFilters}
        />
      ) : (
        <>
          <div className="event-grid">
            {events.map((evt) => (
              <EventCard
                key={evt._id}
                event={evt}
                onSelect={(selected) => setSelectedEvent(selected)}
              />
            ))}
          </div>

          {/* Cursor Pagination Load More */}
          {pagination.hasMore && (
            <div style={{ textAlign: 'center', marginTop: '2.5rem', marginBottom: '2rem' }}>
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="btn btn-outline"
                style={{ padding: '0.75rem 2.5rem', fontSize: '1rem', fontWeight: 600 }}
              >
                {isLoadingMore ? 'Loading More Events...' : 'Load More Events ↓'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Booking Dialog Modal */}
      <BookingModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onBookingComplete={() => {
          // Refresh event counts after booking
          void fetchInitialEvents();
        }}
        onOpenAuth={onOpenAuth}
      />
    </div>
  );
};

