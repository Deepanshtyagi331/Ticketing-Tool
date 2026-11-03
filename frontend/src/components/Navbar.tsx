import React from 'react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth }) => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="navbar">
      <div className="nav-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.6rem' }}>🎟️</span>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
              EventPass
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ticket Booking Engine</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isAuthenticated && user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                  {user.name}
                </span>
                <span className="badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#e0e7ff', color: 'var(--primary)' }}>
                  {user.role}
                </span>
              </div>
              <button onClick={() => void logout()} className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                Sign Out
              </button>
            </div>
          ) : (
            <button onClick={onOpenAuth} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
              Sign In / Register
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

