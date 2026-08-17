import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

/** Dashed placeholder used when a list/section has nothing to show. */
export function EmptyState({ title, description, className = 'health-empty' }: EmptyStateProps) {
  return (
    <div className={className}>
      <strong>{title}</strong>
      {description != null && <small>{description}</small>}
    </div>
  );
}
