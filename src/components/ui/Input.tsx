import React, { forwardRef } from 'react';
import { Search } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  isSearch?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      isSearch = false,
      leftIcon,
      rightIcon,
      className = '',
      id,
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const hasError = Boolean(error);
    const resolvedLeftIcon = isSearch ? <Search size={16} /> : leftIcon;

    return (
      <div className={`form-group ${className}`.trim()}>
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
            {required && <span className="form-required" aria-hidden="true">*</span>}
          </label>
        )}
        <div
          className={`input-wrapper ${resolvedLeftIcon ? 'input-has-left-icon' : ''} ${rightIcon ? 'input-has-right-icon' : ''}`}
        >
          {resolvedLeftIcon && <span className="input-icon-left">{resolvedLeftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                ? `${inputId}-hint`
                : undefined
            }
            className={`form-input ${hasError ? 'has-error' : ''}`}
            {...props}
          />
          {rightIcon && <span className="input-icon-right">{rightIcon}</span>}
        </div>
        {error ? (
          <span id={`${inputId}-error`} className="form-error" role="alert">
            {error}
          </span>
        ) : helperText ? (
          <span id={`${inputId}-hint`} className="form-hint">
            {helperText}
          </span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
