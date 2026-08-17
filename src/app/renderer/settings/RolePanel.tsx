import type { PetPackageAsset } from '@shared/ipc';
import { StudioSectionFrame } from './StudioSectionFrame';
import { Button, Field } from './ui';

interface Props {
  petPackages: PetPackageAsset[];
  selectedPetId: string;
  displayName: string;
  description: string;
  onPetChange(id: string): void;
  onDisplayNameChange(name: string): void;
  onDescriptionChange(description: string): void;
  onNavigateResources(): void;
}

export function RolePanel({
  petPackages,
  selectedPetId,
  displayName,
  description,
  onPetChange,
  onDisplayNameChange,
  onDescriptionChange,
  onNavigateResources,
}: Props) {
  const selectedPackage = petPackages.find((pkg) => pkg.id === selectedPetId);

  return (
    <StudioSectionFrame
      sectionId="role"
      actions={(
        <Button size="small" onClick={onNavigateResources}>
          管理宠物资源
        </Button>
      )}
    >
      <div className="form-grid identity-grid">
        <Field
          label="当前宠物包"
          id="health-role-pet"
          tabIndex={-1}
          hint={selectedPackage?.description || '选择一个有效的 Manifest v2 宠物包'}
        >
          <select value={selectedPetId} onChange={(event) => onPetChange(event.target.value)}>
            {petPackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}{pkg.source === 'user' ? ' · 用户' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="显示名称">
          <input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />
        </Field>
        <Field label="角色简介" span2>
          <input value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
        </Field>
      </div>
    </StudioSectionFrame>
  );
}
