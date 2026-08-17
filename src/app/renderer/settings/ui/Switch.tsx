import type { MouseEventHandler, ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange(next: boolean): void;
  /** Screen-reader label (visually hidden). */
  srLabel: ReactNode;
  onClick?: MouseEventHandler<HTMLLabelElement>;
}

/** Accessible toggle switch styled via `.switch` / `.slider`. */
export function Switch({ checked, onChange, srLabel, onClick }: SwitchProps) {
  return (
    <label className="switch" onClick={onClick}>
      <span className="sr-only">{srLabel}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="slider" />
    </label>
  );
}
