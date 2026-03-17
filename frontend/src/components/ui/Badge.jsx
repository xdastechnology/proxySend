import React from 'react';

const variants = {
  default: 'bg-surface-100 text-surface-600',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
};

const sizes = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export default function Badge({ children, variant = 'default', size = 'md', dot = false, className = '' }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${
          variant === 'green' ? 'bg-green-500' :
          variant === 'red' ? 'bg-red-500' :
          variant === 'yellow' ? 'bg-yellow-500' :
          variant === 'blue' ? 'bg-blue-500' :
          'bg-surface-400'
        }`} />
      )}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const config = {
    connected: { variant: 'green', label: 'Connected', dot: true },
    disconnected: { variant: 'default', label: 'Disconnected', dot: true },
    connecting: { variant: 'yellow', label: 'Connecting', dot: true },
    qr_ready: { variant: 'blue', label: 'Scan QR', dot: true },
    pending: { variant: 'yellow', label: 'Pending' },
    running: { variant: 'blue', label: 'Running', dot: true },
    completed: { variant: 'green', label: 'Completed' },
    approved: { variant: 'green', label: 'Approved' },
    confirmed: { variant: 'green', label: 'Confirmed' },
    rejected: { variant: 'red', label: 'Rejected' },
    sent: { variant: 'green', label: 'Sent' },
    failed: { variant: 'red', label: 'Failed' },
    active: { variant: 'green', label: 'Active', dot: true },
    inactive: { variant: 'default', label: 'Inactive' },
  };

  const cfg = config[status] || { variant: 'default', label: status };
  return <Badge variant={cfg.variant} dot={cfg.dot}>{cfg.label}</Badge>;
}
