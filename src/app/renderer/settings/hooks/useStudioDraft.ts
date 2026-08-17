import { useCallback, useEffect, useRef, useState } from 'react';
import {
  removePetFromConfig,
  type PetConfig,
  type PetSoundSelection,
} from '@shared/pet-config';
import { createCustomState, type StateDraftPatch } from '../config-helpers';

interface Options {
  onToast(message: string): void;
}

type ClickConfig = NonNullable<PetConfig['petOverrides'][string]['click']>;

/**
 * Owns the editable configuration draft: mutation helpers, dirty/saving state,
 * the selected state id, save/reset and the Cmd/Ctrl+S shortcut.
 */
export function useStudioDraft({ onToast }: Options) {
  const draftRevision = useRef(0);
  const [draft, setDraft] = useState<PetConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('idle');

  const initialize = useCallback((config: PetConfig) => {
    setDraft(config);
    setSelectedId(config.states[0]?.id ?? 'idle');
    setDirty(false);
    draftRevision.current += 1;
  }, []);

  const updateConfig = useCallback((mutate: (config: PetConfig) => PetConfig) => {
    setDraft((current) => (current ? mutate(current) : current));
    draftRevision.current += 1;
    setDirty(true);
  }, []);

  const updateState = useCallback(
    (id: string, patch: StateDraftPatch) => {
      updateConfig((config) => ({
        ...config,
        states: config.states.map((s) => (s.id === id ? {
          ...s,
          ...patch,
          text: { ...s.text, ...(patch.text ?? {}) },
          audio: { ...s.audio, ...(patch.audio ?? {}) },
        } : s)),
      }));
    },
    [updateConfig],
  );

  const updateSoundSelection = useCallback(
    (stateId: string, selection: PetSoundSelection | undefined) => {
      updateConfig((config) => {
        const petId = config.pet.selectedId;
        const previous = config.petOverrides[petId] ?? {};
        const soundSelections = { ...(previous.soundSelections ?? {}) };
        if (selection) {
          soundSelections[stateId] = selection;
        } else {
          delete soundSelections[stateId];
        }
        return {
          ...config,
          petOverrides: {
            ...config.petOverrides,
            [petId]: {
              ...previous,
              soundSelections,
              stateSounds: {
                ...(previous.stateSounds ?? {}),
                [stateId]: selection?.mode !== 'none',
              },
            },
          },
        };
      });
    },
    [updateConfig],
  );

  const updateClickInteraction = useCallback(
    (click: ClickConfig) => {
      updateConfig((config) => {
        const petId = config.pet.selectedId;
        const previous = config.petOverrides[petId] ?? {};
        return {
          ...config,
          petOverrides: {
            ...config.petOverrides,
            [petId]: { ...previous, click },
          },
        };
      });
    },
    [updateConfig],
  );

  const removeState = useCallback(
    (id: string) => {
      const fallbackId = draft?.states.find((state) => state.id !== id)?.id ?? 'idle';
      setDraft((current) => {
        if (!current) return current;
        const petOverrides = Object.fromEntries(Object.entries(current.petOverrides).map(([petId, override]) => {
          const soundSelections = { ...(override.soundSelections ?? {}) };
          const stateSounds = { ...(override.stateSounds ?? {}) };
          delete soundSelections[id];
          delete stateSounds[id];
          return [petId, { ...override, soundSelections, stateSounds }];
        }));
        return {
          ...current,
          states: current.states.filter((state) => state.id !== id),
          petOverrides,
        };
      });
      setSelectedId((current) => (current === id ? fallbackId : current));
      draftRevision.current += 1;
      setDirty(true);
    },
    [draft],
  );

  const addCustom = useCallback(() => {
    if (!draft) return;
    const next = createCustomState(draft.states);
    setDraft({ ...draft, states: [...draft.states, next] });
    setSelectedId(next.id);
    draftRevision.current += 1;
    setDirty(true);
  }, [draft]);

  const removePet = useCallback((petId: string) => {
    draftRevision.current += 1;
    setDraft((current) => (current ? removePetFromConfig(current, petId) : current));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    const savedRevision = draftRevision.current;
    setSaving(true);
    const result = await window.petAPI.saveConfig(draft);
    setSaving(false);
    if (result.ok) {
      if (draftRevision.current === savedRevision) {
        setDirty(false);
        onToast('已保存，桌宠已更新');
      } else {
        onToast('已保存先前更改，仍有新更改待保存');
      }
    } else {
      onToast(`保存失败：${result.error ?? '未知错误'}`);
    }
  }, [draft, onToast]);

  const reset = useCallback(async () => {
    const defaults = await window.petAPI.getDefaultConfig();
    setDraft(defaults);
    setSelectedId(defaults.states[0]?.id ?? 'idle');
    draftRevision.current += 1;
    setDirty(true);
    onToast('已恢复默认配置（记得保存）');
  }, [onToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !saving) {
          void save();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, saving, save]);

  useEffect(() => window.petAPI.onConfigUpdate((config) => {
    // Window geometry can change directly from the desktop pet. Keep that
    // portion live without discarding unrelated unsaved studio edits.
    setDraft((current) => (current ? {
      ...current,
      window: config.window,
    } : current));
  }), []);

  return {
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
  };
}
