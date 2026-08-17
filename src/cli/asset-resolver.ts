import type { PetConfig } from '@shared/pet-config';
import type { PetInfo } from '@shared/state-schema';

export function resolvePet(config: PetConfig): PetInfo {
  return {
    found: true,
    id: config.pet.selectedId,
    displayName: config.pet.displayName,
    description: config.pet.description,
  };
}
