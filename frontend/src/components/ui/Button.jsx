import React from 'react';
import Spinner from './Spinner';

const variants = {
  primary: 'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-sm',
  secondary: 'bg-surface-100 hover:bg-surface-200 active:bg-surface-300 text-surface-700 border border-surface-200',
  danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
  ghost: 'hover:bg-surface-100 active:bg-surface-200 text-surface-600',
  outline: 'border border-brand-600 text-brand-600 hover:bg-brand-50 active:bg-brand-100',
};

const sizes = {
  xs: 'px-2.5 py-1.5 text-xs rounded-lg',
  sm: 'px-3 py-2 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3 text-base rounded-xl',
  xl: 'px-6 py-3.5 text-base rounded-xl',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  icon,
  iconRight,
  fullWidth = false,
  type = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2 font-medium
        transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-500
        focus-visible:ring-offset-2 select-none
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" className="shrink-0" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
}
