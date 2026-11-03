import React from 'react';
import type { EventItem } from '../types';

interface EventCardProps {
  event: EventItem;
  onSelect: (event: EventItem) => void;
}

export const EventCard: React.FC<EventCardProps> = ({ event, onSelect }) => {
  const isSoldOut = event.availableSeats <= 0;
  const isLowInventory = event.availableSeats > 0 && event.availableSeats <= 5;

  const formattedDate = new Date(event.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className={`card event-card ${isSoldOut ? 'sold-out-card' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
          {event.title}
        </h3>
        {isSoldOut ? (
          <span className="badge badge-sold-out">Sold Out</span>
        ) : isLowInventory ? (
          <span className="badge badge-low-stock">Only {event.availableSeats} left</span>
        ) : (
          <span className="badge badge-available">{event.availableSeats} available</span>
        )}
      </div>

      <div style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.88rem', margin: '0.6rem 0' }}>
        📅 {formattedDate}
      </div>

      {event.description && (
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
            lineHeight: 1.4,
            marginBottom: '1.2rem',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {event.description}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.8rem', borderTop: '1px solid var(--border)' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Ticket Price</span>
          <span style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
            ${event.price.toFixed(2)}
          </span>
        </div>

        <button
          onClick={() => onSelect(event)}
          disabled={isSoldOut}
          className={`btn ${isSoldOut ? 'btn-disabled' : 'btn-primary'}`}
          style={{ padding: '0.55rem 1.2rem' }}
        >
          {isSoldOut ? 'Sold Out' : 'Book Tickets'}
        </button>
      </div>
    </div>
  );
};

