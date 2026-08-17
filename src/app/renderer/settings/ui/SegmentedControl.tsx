import type { ReactNode } from 'react';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  caption?: ReactNode;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange(value: T): void;
  ariaLabel?: string;
}

/** Preset selector rendered as a grid of `.preset-button`s. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className="size-presets" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            className={`preset-button${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.caption != null && <small>{option.caption}</small>}
          </button>
        );
      })}
    </div>
  );
}
