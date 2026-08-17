import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import { PetPackageManager } from './PetPackageManager';
import { SoundLibraryPanel } from './SoundLibraryPanel';
import { StudioSectionFrame } from './StudioSectionFrame';

interface Props {
  petPackages: PetPackageAsset[];
  librarySounds: SoundLibraryAsset[];
  libraryLoading: boolean;
  volume: number;
  libraryMessage: string | null;
  onPetInstalled(id: string): Promise<void>;
  onDeletePet(pkg: PetPackageAsset): Promise<void>;
  onImportSound(): void;
  onRefreshSounds(): void;
  onOpenSoundFolder(): void;
  onDeleteSound(sound: SoundLibraryAsset): void;
}

export function ResourcesPanel({
  petPackages,
  librarySounds,
  libraryLoading,
  volume,
  libraryMessage,
  onPetInstalled,
  onDeletePet,
  onImportSound,
  onRefreshSounds,
  onOpenSoundFolder,
  onDeleteSound,
}: Props) {
  return (
    <StudioSectionFrame sectionId="resources">
      <PetPackageManager
        packages={petPackages}
        onInstalled={onPetInstalled}
        onDelete={onDeletePet}
      />
      <SoundLibraryPanel
        sounds={librarySounds}
        loading={libraryLoading}
        volume={volume}
        message={libraryMessage}
        onImport={onImportSound}
        onRefresh={onRefreshSounds}
        onOpenFolder={onOpenSoundFolder}
        onDelete={onDeleteSound}
      />
    </StudioSectionFrame>
  );
}
