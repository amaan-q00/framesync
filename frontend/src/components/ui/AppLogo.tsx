'use client';

import React from 'react';
import AppLink from '@/components/ui/AppLink';

function LogoIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 block"
      aria-hidden
    >
      <defs>
        <linearGradient id="fs-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <path
        fill="url(#fs-logo-grad)"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 6h5v2H8v3H6V6zm20 0h-5v2h3v3h2V6zM26 26v-5h-2v3h-3v2h5zM6 26h5v-2H8v-3H6v5z"
      />
      <path fill="url(#fs-logo-grad)" d="M13 11v10l7-5-7-5z" />
    </svg>
  );
}

export interface AppLogoProps {
  href?: string;
  className?: string;
  iconSize?: number;
  showText?: boolean;
}

export function AppLogo({
  href = '/dashboard',
  className = '',
  iconSize = 32,
  showText = true,
}: AppLogoProps): React.ReactElement {
  const content = (
    <>
      <LogoIcon size={iconSize} />
      {showText && <span>FrameSync</span>}
    </>
  );

  const baseClass =
    'inline-flex items-center gap-2 text-lg sm:text-xl font-semibold text-fg hover:text-accent transition-colors duration-150 shrink-0';

  if (href) {
    return (
      <AppLink href={href} className={`${baseClass} ${className}`}>
        {content}
      </AppLink>
    );
  }

  return <div className={`${baseClass} ${className}`}>{content}</div>;
}

export default AppLogo;
