import type { LabelHTMLAttributes, ReactNode } from 'react';

interface FieldProps extends Omit<LabelHTMLAttributes<HTMLLabelElement>, 'title'> {
  label: ReactNode;
  /** Helper text rendered below the control. */
  hint?: ReactNode;
  /** Span both columns of a two-column grid. */
  span2?: boolean;
  /** `field` (default) or `mini-field` density. */
  density?: 'field' | 'mini-field';
  children: ReactNode;
}

/**
 * Labelled form field: `<label><span>label</span>{control}<small>hint</small></label>`.
 * Unifies the three hand-written field markups across panels.
 */
export function Field({
  label,
  hint,
  span2,
  density = 'field',
  className,
  children,
  ...rest
}: FieldProps) {
  const classes = [density, span2 ? 'span2' : '', className].filter(Boolean).join(' ');
  return (
    <label className={classes} {...rest}>
      <span>{label}</span>
      {children}
      {hint != null && <small>{hint}</small>}
    </label>
  );
}
