import type { Severity } from '@shared/state-schema';
import type { HealthSeverity } from '../health';

/** Centralized label maps so severity copy is defined once. */
export const HEALTH_SEVERITY_LABELS: Record<HealthSeverity, string> = {
  blocking: '阻断',
  warning: '警告',
  suggestion: '建议',
};

export const STATE_SEVERITY_LABELS: Record<Severity, string> = {
  info: '信息',
  success: '成功',
  error: '错误',
};
