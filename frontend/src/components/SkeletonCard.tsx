import React from 'react';

export const SkeletonCard: React.FC = () => {
  return (
    <div className="card skeleton-card">
      <div className="skeleton skeleton-title" style={{ width: '70%', height: '1.5rem', marginBottom: '0.8rem' }} />
      <div className="skeleton skeleton-text" style={{ width: '40%', height: '1rem', marginBottom: '1.5rem' }} />
      <div className="skeleton skeleton-text" style={{ width: '90%', height: '0.9rem', marginBottom: '0.5rem' }} />
      <div className="skeleton skeleton-text" style={{ width: '80%', height: '0.9rem', marginBottom: '1.5rem' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <div className="skeleton" style={{ width: '30%', height: '1.8rem', borderRadius: '4px' }} />
        <div className="skeleton" style={{ width: '35%', height: '2.2rem', borderRadius: '6px' }} />
      </div>
    </div>
  );
};

