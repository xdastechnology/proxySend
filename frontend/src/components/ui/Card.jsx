import React from 'react';

export default function Card({ children, className = '', padding = true, hover = false, ...props }) {
  return (
    <div
      className={`
        bg-white rounded-2xl border border-surface-100 shadow-card
        ${padding ? 'p-5 sm:p-6' : ''}
        ${hover ? 'hover:shadow-medium transition-shadow duration-200 cursor-pointer' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }) {
  return (
    <h3 className={`text-base font-semibold text-surface-800 ${className}`}>{children}</h3>
  );
}
