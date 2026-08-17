import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import { effectivePetClickAction, petPackageVisualUrl } from '@shared/pet-package-view';
import { clampPetScale } from '@shared/pet-config';
import { createSettingsHealthSummary, type StudioSectionId } from './health';
import { effectiveSoundSelection } from './config-helpers';
import { useStudioDraft } from './hooks/useStudioDraft';
import { usePetPackages } from './hooks/usePetPackages';
import { useSoundLibrary } from './hooks/useSoundLibrary';
import { useHealthFocus } from './hooks/useHealthFocus';
import { Button } from './ui';
import { StudioShell } from './StudioShell';
import { OverviewPanel } from './OverviewPanel';
import { HealthCheckPanel } from './HealthCheckPanel';
import { LiveStagePanel } from './LiveStagePanel';
import { RolePanel } from './RolePanel';
import { StagePanel } from './StagePanel';
import { InteractionPanel } from './InteractionPanel';
import { SoundPanel } from './SoundPanel';
import { StatesPanel } from './StatesPanel';
import { ResourcesPanel } from './ResourcesPanel';

export function SettingsApp() {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const {
    draft,
    dirty,
    saving,
    selectedId,
    setSelectedId,
    initialize,
    updateConfig,
    updateState,
    updateSoundSelection,
    updateClickInteraction,
    removeState,
    addCustom,
    removePet,
    save,
    reset,
  } = useStudioDraft({ onToast: showToast });

  const { petPackages, reload: reloadPetPackages } = usePetPackages();
  const {
    sounds: librarySounds,
    loading: libraryLoading,
    message: libraryMessage,
    setMessage: setLibraryMessage,
    reload: reloadSoundLibrary,
    importSound,
    openFolder,
  } = useSoundLibrary();

  const [resourcesReady, setResourcesReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<StudioSectionId>('overview');

  const { navigateToSection } = useHealthFocus({ activeSection, setActiveSection, setSelectedId });

  useEffect(() => {
    void (async () => {
      try {
        const config = await window.petAPI.getConfig();
        initialize(config);
        await Promise.all([reloadPetPackages(), reloadSoundLibrary()]);
        setResourcesReady(true);
      } catch (error) {
        setLoadError(`配置工作室加载失败：${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, [initialize, reloadPetPackages, reloadSoundLibrary]);

  const handleImportSound = useCallback(async () => {
    if (await importSound()) {
      showToast('MP3 已加入公共音效库');
    }
  }, [importSound, showToast]);

  const handleDeleteSound = useCallback(async (sound: SoundLibraryAsset) => {
    const draftReferences = draft
      ? Object.entries(draft.petOverrides).flatMap(([petId, override]) => (
          [
            ...(override.click?.sound?.mode === 'library'
              && override.click.sound.soundId === sound.id ? [`${petId}/click`] : []),
            ...Object.entries(override.soundSelections ?? {}).flatMap(([stateId, selection]) => (
              selection.mode === 'library' && selection.soundId === sound.id
                ? [`${petId}/${stateId}`]
                : []
            )),
          ]
        ))
      : [];
    if (draftReferences.length > 0) {
      setLibraryMessage(`删除失败：该音效仍被动作引用（${draftReferences.join('、')}）`);
      return;
    }
    if (!window.confirm(`确定删除用户音效“${sound.name}”吗？`)) return;
    const result = await window.petAPI.deleteSound(sound.id);
    if (!result.ok) {
      const references = result.referencedBy?.length
        ? `（引用：${result.referencedBy.join('、')}）`
        : '';
      setLibraryMessage(`删除失败：${result.error ?? '未知错误'}${references}`);
      return;
    }
    await reloadSoundLibrary();
    showToast('用户音效已删除');
  }, [draft, reloadSoundLibrary, setLibraryMessage, showToast]);

  const handleOpenOfficialWebsite = useCallback(async () => {
    const result = await window.petAPI.openOfficialWebsite();
    if (!result.ok) showToast(`无法打开官网：${result.error ?? '未知错误'}`);
  }, [showToast]);

  const handlePetInstalled = useCallback(async (id: string) => {
    const packages = await reloadPetPackages();
    const installed = packages.find((pkg) => pkg.id === id);
    updateConfig((config) => ({
      ...config,
      pet: {
        ...config.pet,
        selectedId: id,
        displayName: installed?.name ?? config.pet.displayName,
        description: installed?.description ?? config.pet.description,
      },
    }));
    showToast('用户宠物已安装并选中');
  }, [reloadPetPackages, showToast, updateConfig]);

  const handleDeletePet = useCallback(async (pkg: PetPackageAsset) => {
    if (!window.confirm(`确定删除用户宠物“${pkg.name}”吗？相关个性化配置也会被清理。`)) return;
    const result = await window.petAPI.deletePetPackage(pkg.id);
    if (!result.ok) {
      showToast(`删除失败：${result.error ?? '未知错误'}`);
      return;
    }
    removePet(pkg.id);
    await reloadPetPackages();
    showToast('用户宠物已删除');
  }, [reloadPetPackages, removePet, showToast]);

  const handlePreview = useCallback((id: string) => {
    window.petAPI.triggerAction(id);
  }, []);

  const health = useMemo(() => (draft && resourcesReady ? createSettingsHealthSummary({
    config: draft,
    petPackages,
    librarySounds,
  }) : null), [draft, librarySounds, petPackages, resourcesReady]);

  if (loadError) {
    return (
      <div className="loading load-error" role="alert">
        <div>
          <strong>无法打开配置工作室</strong>
          <p>{loadError}</p>
          <Button variant="primary" onClick={() => window.location.reload()}>重新加载</Button>
        </div>
      </div>
    );
  }

  if (!draft || !resourcesReady || !health) {
    return <div className="loading">加载配置中…</div>;
  }

  const selected = draft.states.find((s) => s.id === selectedId) ?? draft.states[0];
  const selectedPackage = petPackages.find((pkg) => pkg.id === draft.pet.selectedId);
  const scale = clampPetScale(draft.window.scale);
  const selectedSound = selected ? effectiveSoundSelection(draft, selected) : undefined;
  const selectedPetOverride = draft.petOverrides[draft.pet.selectedId];
  const clickAction = effectivePetClickAction(selectedPackage, selectedPetOverride?.click);

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <OverviewPanel
            config={draft}
            selectedPackage={selectedPackage}
            petPackages={petPackages}
            librarySounds={librarySounds}
            health={health}
            onNavigate={navigateToSection}
          />
        );
      case 'role':
        return (
          <RolePanel
            petPackages={petPackages}
            selectedPetId={draft.pet.selectedId}
            displayName={draft.pet.displayName}
            description={draft.pet.description}
            onPetChange={(selectedId) => updateConfig((config) => ({
              ...config,
              pet: { ...config.pet, selectedId },
            }))}
            onDisplayNameChange={(displayName) => updateConfig((config) => ({
              ...config,
              pet: { ...config.pet, displayName },
            }))}
            onDescriptionChange={(description) => updateConfig((config) => ({
              ...config,
              pet: { ...config.pet, description },
            }))}
            onNavigateResources={() => navigateToSection('resources')}
          />
        );
      case 'stage':
        return (
          <StagePanel
            scale={scale}
            position={draft.window.position}
            onScaleChange={(nextScale) => updateConfig((config) => ({
              ...config,
              window: { ...config.window, scale: clampPetScale(nextScale) },
            }))}
            onPositionChange={(position) => updateConfig((config) => ({
              ...config,
              window: {
                ...config.window,
                position,
                positionMode: 'preset',
                manualX: undefined,
                manualY: undefined,
              },
            }))}
          />
        );
      case 'interaction':
        return (
          <InteractionPanel
            click={selectedPetOverride?.click}
            petPackage={selectedPackage}
            librarySounds={librarySounds}
            globalVolume={draft.audio.volume}
            onChange={updateClickInteraction}
            onPreview={() => {
              if (!clickAction || !selectedPackage) return;
              window.petAPI.previewPetClick({
                petId: selectedPackage.id,
                action: clickAction,
                sound: selectedPetOverride?.click?.sound ?? { mode: 'none' },
              });
            }}
          />
        );
      case 'sound':
        return (
          <SoundPanel
            enabled={draft.audio.enabled}
            volume={draft.audio.volume}
            librarySounds={librarySounds}
            onEnabledChange={(enabled) => updateConfig((config) => ({
              ...config,
              audio: { ...config.audio, enabled },
            }))}
            onVolumeChange={(volume) => updateConfig((config) => ({
              ...config,
              audio: { ...config.audio, volume },
            }))}
            onNavigateResources={() => navigateToSection('resources')}
          />
        );
      case 'states':
        return (
          <StatesPanel
            states={draft.states}
            selectedId={selectedId}
            petPackage={selectedPackage}
            librarySounds={librarySounds}
            globalVolume={draft.audio.volume}
            getSoundSelection={(state) => effectiveSoundSelection(draft, state)}
            onSelect={setSelectedId}
            onAdd={addCustom}
            onChange={updateState}
            onSoundSelection={updateSoundSelection}
            onPreview={handlePreview}
            onRemove={removeState}
          />
        );
      case 'resources':
        return (
          <ResourcesPanel
            petPackages={petPackages}
            librarySounds={librarySounds}
            libraryLoading={libraryLoading}
            volume={draft.audio.volume}
            libraryMessage={libraryMessage}
            onPetInstalled={handlePetInstalled}
            onDeletePet={handleDeletePet}
            onImportSound={() => void handleImportSound()}
            onRefreshSounds={() => void reloadSoundLibrary()}
            onOpenSoundFolder={() => void openFolder()}
            onDeleteSound={(sound) => void handleDeleteSound(sound)}
          />
        );
      case 'checks':
        return <HealthCheckPanel health={health} onNavigate={navigateToSection} />;
      default:
        return null;
    }
  };

  return (
    <StudioShell
      activeSection={activeSection}
      dirty={dirty}
      saving={saving}
      health={health}
      onSectionChange={setActiveSection}
      onOpenOfficialWebsite={() => void handleOpenOfficialWebsite()}
      onReset={() => void reset()}
      onSave={() => void save()}
      stage={(
        <LiveStagePanel
          state={selected}
          visualUrl={selected ? petPackageVisualUrl(selectedPackage, selected.id) : null}
          petName={draft.pet.displayName}
          petPackage={selectedPackage}
          librarySounds={librarySounds}
          soundSelection={selectedSound}
          scale={scale}
          onPreviewState={() => selected && handlePreview(selected.id)}
          onNavigate={navigateToSection}
        />
      )}
    >
      {renderActiveSection()}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </StudioShell>
  );
}
