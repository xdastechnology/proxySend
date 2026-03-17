import React, { forwardRef } from 'react';

const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    className = '',
    containerClassName = '',
    leftIcon,
    rightIcon,
    required,
    ...props
  },
  ref
) {
  const id = props.id || props.name;

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-surface-700"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-surface-400">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={id}
          className={`
            w-full px-3 py-2.5 text-sm bg-white border rounded-xl
            transition-colors duration-150 placeholder:text-surface-400
            text-surface-900
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${error
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : 'border-surface-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'
            }
            ${className}
          `}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-surface-400">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-surface-500">{hint}</p>}
    </div>
  );
});

export default Input;
