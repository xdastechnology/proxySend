import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Dialog({ open, onClose, title, children, size = 'md', className = '' }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && open) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`
          relative w-full bg-white rounded-t-3xl sm:rounded-2xl shadow-medium
          animate-slide-up max-h-[90vh] overflow-y-auto scrollbar-thin
          ${sizeClasses[size]} ${className}
        `}
      >
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-surface-100 sticky top-0 bg-white z-10">
            <h2 className="text-base font-semibold text-surface-800">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-surface-100 transition-colors text-surface-500"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
