import type { StudioSectionId } from './health';

export interface StudioSectionDefinition {
  id: StudioSectionId;
  icon: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
}

export const STUDIO_SECTIONS: StudioSectionDefinition[] = [
  {
    id: 'overview',
    icon: '⌂',
    label: '总览',
    eyebrow: 'OVERVIEW',
    title: '工作室总览',
    description: '查看当前伙伴、关键配置状态和待处理问题。',
  },
  {
    id: 'role',
    icon: '◉',
    label: '角色',
    eyebrow: 'COMPANION',
    title: '伙伴身份',
    description: '选择当前伙伴，并定义它在提示气泡中的名字与个性。',
  },
  {
    id: 'stage',
    icon: '◇',
    label: '舞台',
    eyebrow: 'STAGE',
    title: '外观与位置',
    description: '调校桌宠大小、停靠位置和舞台呈现方式。',
  },
  {
    id: 'interaction',
    icon: '↗',
    label: '互动',
    eyebrow: 'INTERACTION',
    title: '点击互动',
    description: '配置点击宠物时播放的动作与独立语音。',
  },
  {
    id: 'sound',
    icon: '♫',
    label: '声音',
    eyebrow: 'SOUND',
    title: '声音',
    description: '控制全局声音和主音量；资源库用于管理音效文件。',
  },
  {
    id: 'states',
    icon: '≋',
    label: '状态',
    eyebrow: 'BEHAVIOR',
    title: '状态与行为',
    description: '配置每个状态的视觉、音效曲目与播放行为。',
  },
  {
    id: 'resources',
    icon: '▦',
    label: '资源',
    eyebrow: 'ASSETS',
    title: '资源管理',
    description: '集中管理宠物包、九图快速制作、公共音效和资源诊断。',
  },
  {
    id: 'checks',
    icon: '✓',
    label: '检查',
    eyebrow: 'QUALITY',
    title: '发布前检查',
    description: '查看阻断问题、警告和可优化建议，并跳转到对应模块。',
  },
];

export function sectionById(id: StudioSectionId): StudioSectionDefinition {
  return STUDIO_SECTIONS.find((section) => section.id === id) ?? STUDIO_SECTIONS[0];
}
