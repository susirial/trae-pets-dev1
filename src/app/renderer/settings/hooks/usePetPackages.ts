import { useCallback, useState } from 'react';
import type { PetPackageAsset } from '@shared/ipc';

/** Owns the installed pet-package list and its reload. */
export function usePetPackages() {
  const [petPackages, setPetPackages] = useState<PetPackageAsset[]>([]);

  const reload = useCallback(async () => {
    const packages = await window.petAPI.listPetPackages();
    setPetPackages(packages);
    return packages;
  }, []);

  return { petPackages, reload };
}
