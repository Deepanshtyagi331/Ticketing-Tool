import React, { useState, useEffect, useRef } from 'react';
import { bookingsApi } from '../api/bookings.api';
import { CountdownTimer } from './CountdownTimer';
import { Alert } from './Alert';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import type { EventItem, Booking } from '../types';

interface BookingModalProps {
  event: EventItem | null;
  onClose: () => void;
  onBookingComplete?: () => void;
  onOpenAuth: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  event,
  onClose,
  onBookingComplete,
  onOpenAuth
}) => {
  const { isAuthenticated } = useAuth();
  const [seats, setSeats] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [errorStatus, setErrorStatus] = useState<'SOLD_OUT' | 'RATE_LIMITED' | 'GENERAL' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState<boolean>(false);

  // Generate unique idempotency key once per logical booking attempt
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    // Reset key if event changes
    idempotencyKeyRef.current = crypto.randomUUID();
    setBooking(null);
    setErrorStatus(null);
    setErrorMessage(null);
  }, [event?._id]);

  if (!event) return null;

  const handleBookingSubmit = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorStatus(null);
      setErrorMessage(null);

      // Reuses the exact same idempotency key for this logical booking attempt (guaranteeing idempotency on retry)
      const res = await bookingsApi.createBooking(
        event._id,
        seats,
        idempotencyKeyRef.current
      );

      setBooking(res.booking);
      if (onBookingComplete) {
        onBookingComplete();
      }
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      if (errObj.code === 'CONFLICT' || errObj.message?.toLowerCase().includes('insufficient')) {
        setErrorStatus('SOLD_OUT');
        setErrorMessage('This event has sold out or does not have enough remaining seats.');
      } else if (errObj.code === 'TOO_MANY_REQUESTS') {
        setErrorStatus('RATE_LIMITED');
        setErrorMessage('Rate limit reached: Maximum 5 bookings per minute allowed. Please wait a moment.');
      } else {
        setErrorStatus('GENERAL');
        setErrorMessage(errObj.message || 'An error occurred while creating your reservation.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMockPayment = async () => {
    if (!booking) return;

    try {
      setIsSimulatingPayment(true);
      // Calls the mock webhook endpoint to confirm payment
      await apiClient.post('/payments/webhook', {
        event: 'payment.succeeded',
        bookingId: booking.id,
        paymentId: `sim_${crypto.randomUUID().slice(0, 8)}`,
        amount: booking.amount
      });

      setBooking((prev) => (prev ? { ...prev, status: 'CONFIRMED' } : null));
      if (onBookingComplete) {
        onBookingComplete();
      }
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setErrorMessage(errObj.message || 'Payment simulation failed.');
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  const totalAmount = event.price * seats;

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
            {booking?.status === 'CONFIRMED' ? '🎉 Booking Confirmed!' : `Reserve: ${event.title}`}
          </h2>
          <button onClick={onClose} className="btn-close" aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Error States */}
        {errorStatus === 'SOLD_OUT' && (
          <Alert
            type="error"
            title="SOLD OUT"
            message={errorMessage || 'Sorry, there are not enough seats remaining for this event.'}
          />
        )}

        {errorStatus === 'RATE_LIMITED' && (
          <Alert
            type="warning"
            title="RATE LIMITED"
            message={errorMessage || 'Too many requests. Please pause before trying again.'}
          />
        )}

        {errorStatus === 'GENERAL' && errorMessage && (
          <Alert type="error" title="Booking Error" message={errorMessage} />
        )}

        {/* Active Booking Created State */}
        {booking ? (
          <div>
            <div
              style={{
                background: booking.status === 'CONFIRMED' ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${booking.status === 'CONFIRMED' ? '#86efac' : 'var(--border)'}`,
                padding: '1.5rem',
                borderRadius: '10px',
                marginBottom: '1.5rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status:</span>
                {booking.status === 'CONFIRMED' ? (
                  <span className="badge badge-success" style={{ fontSize: '0.85rem' }}>
                    ✓ CONFIRMED
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>
                    ⏳ PENDING RESERVATION
                  </span>
                )}
              </div>

              {booking.status === 'PENDING' && (
                <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                  <CountdownTimer
                    expiresAt={booking.expiresAt}
                    onExpire={() => {
                      setBooking((prev) => (prev ? { ...prev, status: 'EXPIRED' } : null));
                    }}
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Your seats are temporarily held. Complete payment before the timer expires to confirm your booking.
                  </p>
                </div>
              )}

              <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.8 }}>
                <div><strong>Booking ID:</strong> <code style={{ fontSize: '0.8rem' }}>{booking.id}</code></div>
                <div><strong>Seats Reserved:</strong> {booking.seats} seat{booking.seats > 1 ? 's' : ''}</div>
                <div><strong>Total Amount:</strong> ${booking.amount.toFixed(2)}</div>
                <div><strong>Idempotency Key:</strong> <code style={{ fontSize: '0.75rem' }}>{booking.idempotencyKey}</code></div>
              </div>
            </div>

            {booking.status === 'PENDING' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <button
                  onClick={handleMockPayment}
                  disabled={isSimulatingPayment}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                >
                  {isSimulatingPayment ? 'Processing Payment...' : '💳 Simulate Mock Payment Success'}
                </button>
                <small style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                  Triggers mock payment webhook with HMAC validation on the backend.
                </small>
              </div>
            )}

            {booking.status === 'CONFIRMED' && (
              <button
                onClick={onClose}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem' }}
              >
                Close & Return to Events
              </button>
            )}

            {booking.status === 'EXPIRED' && (
              <div style={{ textAlign: 'center' }}>
                <Alert
                  type="error"
                  title="RESERVATION EXPIRED"
                  message="Your reservation hold expired and the seats have been released back to inventory."
                />
                <button onClick={onClose} className="btn btn-outline" style={{ width: '100%' }}>
                  Back to Events
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Initial Form State */
          <div>
            <div style={{ marginBottom: '1.2rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              <div>📅 <strong>Date:</strong> {new Date(event.date).toLocaleString()}</div>
              <div>🎟️ <strong>Available Seats:</strong> {event.availableSeats} of {event.totalSeats}</div>
              <div>💲 <strong>Price per ticket:</strong> ${event.price.toFixed(2)}</div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                Select Seat Quantity:
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setSeats((s) => Math.max(1, s - 1))}
                  disabled={seats <= 1 || isSubmitting}
                  className="btn btn-outline"
                  style={{ width: '40px', height: '40px', padding: 0, fontSize: '1.2rem' }}
                >
                  -
                </button>
                <span style={{ fontSize: '1.3rem', fontWeight: 700, minWidth: '40px', textAlign: 'center' }}>
                  {seats}
                </span>
                <button
                  type="button"
                  onClick={() => setSeats((s) => Math.min(event.availableSeats, s + 1))}
                  disabled={seats >= event.availableSeats || isSubmitting}
                  className="btn btn-outline"
                  style={{ width: '40px', height: '40px', padding: 0, fontSize: '1.2rem' }}
                >
                  +
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                backgroundColor: 'var(--background)',
                borderRadius: '8px',
                marginBottom: '1.5rem'
              }}
            >
              <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>Estimated Total:</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
                ${totalAmount.toFixed(2)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn btn-outline"
                style={{ flex: 1, padding: '0.75rem' }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleBookingSubmit}
                disabled={isSubmitting || event.availableSeats <= 0}
                className="btn btn-primary"
                style={{ flex: 2, padding: '0.75rem', fontSize: '1rem' }}
              >
                {isSubmitting ? 'Reserving...' : isAuthenticated ? `Reserve ${seats} Ticket${seats > 1 ? 's' : ''}` : 'Sign In to Book'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
