import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const variants = {
  success: {
    container: 'bg-green-50 border-green-200 text-green-800',
    icon: <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />,
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-800',
    icon: <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />,
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />,
  },
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />,
  },
};

export default function Alert({ type = 'info', title, children, onDismiss, className = '' }) {
  const cfg = variants[type];

  return (
    <div
      className={`flex gap-3 p-4 rounded-xl border text-sm animate-fade-in ${cfg.container} ${className}`}
      role="alert"
    >
      {cfg.icon}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
