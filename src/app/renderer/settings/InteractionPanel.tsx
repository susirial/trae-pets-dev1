import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { PetClickConfig } from '@shared/pet-config';
import { ClickInteractionEditor } from './ClickInteractionEditor';
import { StudioSectionFrame } from './StudioSectionFrame';

interface Props {
  click: PetClickConfig | undefined;
  petPackage: PetPackageAsset | undefined;
  librarySounds: SoundLibraryAsset[];
  globalVolume: number;
  onChange(click: PetClickConfig): void;
  onPreview(): void;
}

export function InteractionPanel({
  click,
  petPackage,
  librarySounds,
  globalVolume,
  onChange,
  onPreview,
}: Props) {
  return (
    <StudioSectionFrame sectionId="interaction">
      <div id="health-interaction" tabIndex={-1}>
        <ClickInteractionEditor
          click={click}
          petPackage={petPackage}
          librarySounds={librarySounds}
          globalVolume={globalVolume}
          onChange={onChange}
          onPreview={onPreview}
        />
      </div>
    </StudioSectionFrame>
  );
}
