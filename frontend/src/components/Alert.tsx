import React from 'react';

export interface AlertProps {
  type: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  message: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ type, title, message, onClose }) => {
  const getColors = () => {
    switch (type) {
      case 'error':
        return {
          bg: '#fee2e2',
          border: '#f87171',
          text: '#991b1b',
          icon: '⚠️'
        };
      case 'success':
        return {
          bg: '#dcfce7',
          border: '#4ade80',
          text: '#166534',
          icon: '✅'
        };
      case 'warning':
        return {
          bg: '#fef3c7',
          border: '#fcd34d',
          text: '#92400e',
          icon: '⏳'
        };
      case 'info':
      default:
        return {
          bg: '#e0e7ff',
          border: '#818cf8',
          text: '#3730a3',
          icon: 'ℹ️'
        };
    }
  };

  const style = getColors();

  return (
    <div
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        padding: '0.85rem 1rem',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.75rem',
        fontSize: '0.9rem',
        marginBottom: '1rem',
        lineHeight: 1.4
      }}
    >
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{style.icon}</span>
        <div>
          {title && <strong style={{ display: 'block', marginBottom: '0.2rem' }}>{title}</strong>}
          <div>{message}</div>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: style.text,
            cursor: 'pointer',
            fontSize: '1rem',
            padding: '0 0.25rem',
            lineHeight: 1
          }}
          aria-label="Close notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};

