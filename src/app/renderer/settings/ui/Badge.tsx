import type { ReactNode } from 'react';

export type BadgeTone = 'builtin' | 'custom';

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
