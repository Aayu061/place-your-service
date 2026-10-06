import React, { forwardRef } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      error,
      className = '',
      id,
      required,
      disabled,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const hasError = Boolean(error);

    return (
      <div className={`form-group ${className}`.trim()}>
        {label && (
          <label htmlFor={textareaId} className="form-label">
            {label}
            {required && <span className="form-required" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            error
              ? `${textareaId}-error`
              : helperText
              ? `${textareaId}-hint`
              : undefined
          }
          className={`form-textarea ${hasError ? 'has-error' : ''}`}
          {...props}
        />
        {error ? (
          <span id={`${textareaId}-error`} className="form-error" role="alert">
            {error}
          </span>
        ) : helperText ? (
          <span id={`${textareaId}-hint`} className="form-hint">
            {helperText}
          </span>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
