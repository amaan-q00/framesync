import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  type = 'text',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  const baseClasses =
    'w-full px-3 py-2 border border-border rounded-lg bg-surface text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-page focus:border-primary transition-[border-color,box-shadow] duration-150';
  const errorClasses = error ? 'border-danger focus:ring-danger focus:border-danger' : '';

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-fg mb-1">{label}</label>
      )}
      <div className="relative">
        <input
          className={`${baseClasses} ${errorClasses} ${className} ${isPassword ? 'pr-10' : ''}`}
          type={inputType}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center min-w-[44px] min-h-[44px] text-fg-muted hover:text-fg focus:outline-none transition-colors duration-150"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <Eye className="w-5 h-5" aria-hidden />
            ) : (
              <EyeOff className="w-5 h-5" aria-hidden />
            )}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-danger">{error}</p>
      )}
    </div>
  );
};

export default Input;
