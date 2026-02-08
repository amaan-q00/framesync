'use client';

import React from 'react';
import NextLink from 'next/link';
import type { AppRoute } from '@/types';
import type { ComponentPropsWithoutRef } from 'react';

type NextLinkProps = ComponentPropsWithoutRef<typeof NextLink>;

/** Use for in-app navigation. Prefer over <a> for client-side routing and type-safe hrefs. */
export interface AppLinkProps extends Omit<NextLinkProps, 'href'> {
  href: AppRoute | NextLinkProps['href'];
  children: React.ReactNode;
}

export function AppLink({ href, children, ...rest }: AppLinkProps): React.ReactElement {
  return <NextLink href={href} {...rest}>{children}</NextLink>;
}

export default AppLink;
