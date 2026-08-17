import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'official';
export type ButtonSize = 'default' | 'small' | 'tiny';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional keyboard-shortcut hint rendered as a <kbd> chip. */
  kbd?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: '',
  primary: 'primary',
  ghost: 'ghost',
  danger: 'danger',
  official: 'official-link',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: '',
  small: 'small',
  tiny: 'tiny',
};

export function Button({
  variant = 'default',
  size = 'default',
  kbd,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  const classes = ['btn', VARIANT_CLASS[variant], SIZE_CLASS[size], className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type ?? 'button'} className={classes} {...rest}>
      {children}
      {kbd != null && <kbd>{kbd}</kbd>}
    </button>
  );
}
