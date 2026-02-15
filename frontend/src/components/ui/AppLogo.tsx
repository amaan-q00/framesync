'use client';

import React from 'react';
import AppLink from '@/components/ui/AppLink';
import { Film } from 'lucide-react';

/** App logo: Film icon + FrameSync. Use in all headers. Links to /dashboard when href provided. */
export interface AppLogoProps {
  href?: string;
  className?: string;
  iconSize?: number;
  showText?: boolean;
}

export function AppLogo({
  href = '/dashboard',
  className = '',
  iconSize = 22,
  showText = true,
}: AppLogoProps): React.ReactElement {
  const content = (
    <>
      <Film size={iconSize} className="shrink-0 text-primary" aria-hidden />
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
