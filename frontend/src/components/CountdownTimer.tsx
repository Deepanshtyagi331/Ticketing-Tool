import React, { useEffect, useState } from 'react';

interface CountdownTimerProps {
  expiresAt: string;
  onExpire?: () => void;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ expiresAt, onExpire }) => {
  const calculateRemainingSeconds = (): number => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  };

  const [remaining, setRemaining] = useState<number>(calculateRemainingSeconds);

  useEffect(() => {
    setRemaining(calculateRemainingSeconds());

    const interval = setInterval(() => {
      const secondsLeft = calculateRemainingSeconds();
      setRemaining(secondsLeft);

      if (secondsLeft <= 0) {
        clearInterval(interval);
        if (onExpire) {
          onExpire();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining < 120; // Under 2 minutes left

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.4rem 0.8rem',
        borderRadius: '8px',
        backgroundColor: isUrgent ? '#fee2e2' : '#fef3c7',
        color: isUrgent ? '#991b1b' : '#92400e',
        fontWeight: 600,
        fontSize: '0.9rem',
        border: `1px solid ${isUrgent ? '#fca5a5' : '#fde68a'}`
      }}
    >
      <span>⏱️</span>
      <span>
        Hold expires in:{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </strong>
      </span>
    </div>
  );
};

