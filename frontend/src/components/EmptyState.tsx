import React from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No events found',
  description = 'Try adjusting your search criteria or date filters to find upcoming experiences.',
  actionLabel,
  onAction
}) => {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '4rem 1.5rem',
        background: '#ffffff',
        border: '1px dashed var(--border)',
        borderRadius: '12px',
        margin: '2rem 0'
      }}
    >
      <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎟️</div>
      <h3 style={{ fontSize: '1.25rem', color: 'var(--text)', marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem auto' }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn btn-outline">
          {actionLabel}
        </button>
      )}
    </div>
  );
};

