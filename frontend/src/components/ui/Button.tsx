import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  isLoading = false,
  icon,
  iconPosition = 'left',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-page min-h-[44px] min-w-[44px] sm:min-w-0';

  const variants = {
    primary:
      'bg-primary text-white hover:bg-[var(--primary-hover)] focus:ring-[var(--primary-ring)]',
    secondary:
      'bg-surface text-fg border border-border hover:bg-elevated focus:ring-primary',
    outline:
      'border border-border text-fg bg-transparent hover:bg-surface focus:ring-primary',
    destructive:
      'bg-danger text-white hover:bg-[var(--danger-hover)] focus:ring-[var(--danger-ring)]',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5 min-h-[36px] sm:min-h-[44px]',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2',
  };

  const disabledClasses =
    disabled || isLoading ? 'opacity-50 cursor-not-allowed' : '';

  const classes = `${baseClasses} ${variants[variant]} ${sizes[size]} ${disabledClasses} ${className}`;

  const content = (
    <>
      {isLoading ? (
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
          {typeof children === 'string' ? 'Loading...' : children}
        </div>
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <span className="shrink-0 [&>svg]:size-[1.125em]" aria-hidden>
              {icon}
            </span>
          )}
          {children}
          {icon && iconPosition === 'right' && (
            <span className="shrink-0 [&>svg]:size-[1.125em]" aria-hidden>
              {icon}
            </span>
          )}
        </>
      )}
    </>
  );

  return (
    <button className={classes} disabled={disabled || isLoading} {...props}>
      {content}
    </button>
  );
};

export default Button;
