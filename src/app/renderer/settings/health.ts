import type { PetPackageAsset, SoundLibraryAsset } from '@shared/ipc';
import type { PetConfig, PetSoundSelection } from '@shared/pet-config';

export type StudioSectionId = 'overview' | 'role' | 'stage' | 'interaction' | 'sound' | 'states' | 'resources' | 'checks';

export type HealthSeverity = 'blocking' | 'warning' | 'suggestion';

export interface SettingsHealthIssue {
  code: string;
  severity: HealthSeverity;
  title: string;
  detail: string;
  section: StudioSectionId;
  stateId?: string;
  target?: string;
}

export interface SettingsHealthSummary {
  score: number;
  level: 'excellent' | 'good' | 'attention' | 'blocked';
  blockingCount: number;
  warningCount: number;
  suggestionCount: number;
  issues: SettingsHealthIssue[];
}

interface HealthInput {
  config: PetConfig;
  petPackages: PetPackageAsset[];
  librarySounds: SoundLibraryAsset[];
}

function addIssue(issues: SettingsHealthIssue[], issue: SettingsHealthIssue) {
  if (!issues.some((entry) => entry.code === issue.code && entry.stateId === issue.stateId)) {
    issues.push(issue);
  }
}

function scoreFor(issues: SettingsHealthIssue[]): number {
  const blocking = issues.filter((issue) => issue.severity === 'blocking').length;
  const warning = issues.filter((issue) => issue.severity === 'warning').length;
  const suggestion = issues.filter((issue) => issue.severity === 'suggestion').length;
  return Math.max(0, Math.min(100, 100 - blocking * 35 - warning * 8 - suggestion * 3));
}

function levelFor(score: number, blockingCount: number): SettingsHealthSummary['level'] {
  if (blockingCount > 0) return 'blocked';
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  return 'attention';
}

function hasConfiguredSound(selection: PetSoundSelection | undefined): boolean {
  return selection?.mode === 'sound' || selection?.mode === 'library';
}

export function createSettingsHealthSummary({
  config,
  petPackages,
  librarySounds,
}: HealthInput): SettingsHealthSummary {
  const issues: SettingsHealthIssue[] = [];
  const selectedPet = petPackages.find((pkg) => pkg.id === config.pet.selectedId);
  const selectedOverride = config.petOverrides[config.pet.selectedId];
  const soundSelections = selectedOverride?.soundSelections ?? {};

  if (!selectedPet) {
    addIssue(issues, {
      code: 'selected-pet-missing',
      severity: 'blocking',
      title: '当前宠物包不可用',
      detail: `配置选择了 ${config.pet.selectedId}，但宠物库中没有找到该包。`,
      section: 'role',
      target: 'role-pet',
    });
  }

  const stateCounts = new Map<string, number>();
  for (const state of config.states) {
    stateCounts.set(state.id, (stateCounts.get(state.id) ?? 0) + 1);
  }

  for (const state of config.states) {
    if ((stateCounts.get(state.id) ?? 0) > 1) {
      addIssue(issues, {
        code: 'duplicate-state-id',
        severity: 'blocking',
        title: '状态 ID 重复',
        detail: `${state.label} 使用了重复 ID“${state.id}”，状态触发将无法可靠匹配。`,
        section: 'states',
        stateId: state.id,
        target: `state-${state.id}`,
      });
    }
    const visualStateId = selectedPet?.actions[state.id] ?? state.id;
    if (state.enabled && selectedPet && !selectedPet.visuals[visualStateId]) {
      addIssue(issues, {
        code: 'state-visual-missing',
        severity: 'blocking',
        title: '状态视觉资源缺失',
        detail: `${state.label} 没有可用的视觉资源映射。`,
        section: 'states',
        stateId: state.id,
        target: `state-${state.id}`,
      });
    }
    const selection = soundSelections[state.id];
    if (selection?.mode === 'sound' && selectedPet && !selectedPet.sounds[selection.soundId]) {
      addIssue(issues, {
        code: 'package-sound-missing',
        severity: 'blocking',
        title: '包内音效引用不存在',
        detail: `${state.label} 引用了 ${selection.soundId}，但当前宠物包没有该音效。`,
        section: 'states',
        stateId: state.id,
        target: `state-${state.id}`,
      });
    }
    if (selection?.mode === 'library' && !librarySounds.some((sound) => sound.id === selection.soundId)) {
      addIssue(issues, {
        code: 'library-sound-missing',
        severity: 'blocking',
        title: '公共音效引用不存在',
        detail: `${state.label} 引用了 ${selection.soundId}，但公共音效库没有该文件。`,
        section: 'states',
        stateId: state.id,
        target: `state-${state.id}`,
      });
    }
  }

  const effectiveAudioEnabled = selectedOverride?.audio?.enabled ?? config.audio.enabled;
  const hasStateSound = config.states.some((state) => (
    hasConfiguredSound(soundSelections[state.id])
    || (selectedOverride?.stateSounds?.[state.id] ?? state.audio.enabled)
  ));
  const hasClickSound = hasConfiguredSound(selectedOverride?.click?.sound);
  if (!effectiveAudioEnabled && (hasStateSound || hasClickSound)) {
    addIssue(issues, {
      code: 'audio-disabled-with-sounds',
      severity: 'warning',
      title: '声音已关闭但仍配置了音效',
      detail: '主声音开关关闭后，状态音效和点击音效都不会播放。',
      section: 'sound',
      target: 'sound-global',
    });
  }

  const enabledStates = config.states.filter((state) => state.enabled).length;
  if (enabledStates === 0) {
    addIssue(issues, {
      code: 'all-states-disabled',
      severity: 'blocking',
      title: '所有状态都已停用',
      detail: '至少需要启用一个状态，桌宠才能展示有效反馈。',
      section: 'states',
      target: 'states-list',
    });
  } else if (enabledStates < Math.max(3, Math.ceil(config.states.length / 3))) {
    addIssue(issues, {
      code: 'few-states-enabled',
      severity: 'warning',
      title: '启用状态较少',
      detail: `当前只启用了 ${enabledStates} 个状态，桌宠反馈可能不够丰富。`,
      section: 'states',
      target: 'states-list',
    });
  }

  if (!selectedOverride?.click?.action) {
    addIssue(issues, {
      code: 'click-action-not-customized',
      severity: 'suggestion',
      title: '点击互动尚未个性化',
      detail: '为当前宠物配置点击动作能让工作室作品更完整。',
      section: 'interaction',
      target: 'interaction',
    });
  } else if (selectedPet && !selectedPet.actionOptions.some((option) => (
    option.id === selectedOverride.click?.action
  ))) {
    addIssue(issues, {
      code: 'click-action-missing',
      severity: 'blocking',
      title: '点击动作引用不存在',
      detail: `当前点击动作“${selectedOverride.click.action}”不在宠物包可用动作中。`,
      section: 'interaction',
      target: 'interaction',
    });
  }

  const clickSound = selectedOverride?.click?.sound;
  if (clickSound?.mode === 'sound' && selectedPet && !selectedPet.sounds[clickSound.soundId]) {
    addIssue(issues, {
      code: 'click-package-sound-missing',
      severity: 'blocking',
      title: '点击音效引用不存在',
      detail: `点击互动引用了不存在的包内音效“${clickSound.soundId}”。`,
      section: 'interaction',
      target: 'interaction',
    });
  }
  if (clickSound?.mode === 'library' && !librarySounds.some((sound) => sound.id === clickSound.soundId)) {
    addIssue(issues, {
      code: 'click-library-sound-missing',
      severity: 'blocking',
      title: '点击公共音效不可用',
      detail: `点击互动引用了公共音效“${clickSound.soundId}”，但音效库中没有该文件。`,
      section: 'interaction',
      target: 'interaction',
    });
  }

  const score = scoreFor(issues);
  const blockingCount = issues.filter((issue) => issue.severity === 'blocking').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const suggestionCount = issues.filter((issue) => issue.severity === 'suggestion').length;

  return {
    score,
    level: levelFor(score, blockingCount),
    blockingCount,
    warningCount,
    suggestionCount,
    issues,
  };
}
