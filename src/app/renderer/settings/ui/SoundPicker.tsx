import type { ReactNode } from 'react';
import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { ResolvedPetPackageSound } from '@shared/pet-package-view';
import { StateSoundPreview } from '../StateSoundPreview';

interface SoundPickerProps {
  ariaLabel: string;
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
  petPackage: PetPackageAsset | undefined;
  librarySounds: SoundLibraryAsset[];
  /** Options/optgroups rendered before the package + library groups. */
  leading: ReactNode;
  /** Fallback options for references that no longer resolve. */
  missing?: ReactNode;
  preview: { sound: ResolvedPetPackageSound; volume: number; label: string };
}

/**
 * Sound selection row shared by the state editor and click editor.
 * Owns the two common optgroups (package tracks + shared library) and the
 * inline audition button; callers supply the leading/missing options that differ.
 */
export function SoundPicker({
  ariaLabel,
  value,
  disabled,
  onChange,
  petPackage,
  librarySounds,
  leading,
  missing,
  preview,
}: SoundPickerProps) {
  return (
    <div className="sound-picker-row">
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {leading}
        <optgroup label="包内曲目">
          {Object.entries(petPackage?.sounds ?? {}).map(([soundId, asset]) => (
            <option key={soundId} value={`sound:${soundId}`}>
              {soundId} · {asset.file.split('/').pop()}
            </option>
          ))}
        </optgroup>
        <optgroup label="公共音效库">
          {librarySounds.map((asset) => (
            <option key={asset.id} value={`library:${asset.id}`}>
              {asset.name} · {asset.source === 'built-in' ? '内置' : '用户'}
            </option>
          ))}
        </optgroup>
        {missing}
      </select>
      <StateSoundPreview sound={preview.sound} volume={preview.volume} label={preview.label} />
    </div>
  );
}
