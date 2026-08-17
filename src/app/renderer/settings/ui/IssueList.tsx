import type { SettingsHealthIssue, StudioSectionId } from '../health';
import { HEALTH_SEVERITY_LABELS } from './labels';

interface IssueListProps {
  issues: SettingsHealthIssue[];
  /** `overview` (compact grid) or `checks` (full list) styling. */
  variant: 'overview' | 'checks';
  onNavigate(section: StudioSectionId, stateId?: string, target?: string): void;
}

/** Shared clickable health-issue list used by Overview and Checks. */
export function IssueList({ issues, variant, onNavigate }: IssueListProps) {
  const listClass = variant === 'overview' ? 'overview-issue-list' : 'health-issue-list';
  const itemClass = variant === 'overview' ? 'overview-issue' : 'health-issue';
  return (
    <div className={listClass}>
      {issues.map((issue) => (
        <button
          key={`${issue.code}-${issue.stateId ?? 'global'}`}
          type="button"
          className={`${itemClass} issue-${issue.severity}`}
          onClick={() => onNavigate(issue.section, issue.stateId, issue.target)}
        >
          <span>{HEALTH_SEVERITY_LABELS[issue.severity]}</span>
          <strong>{issue.title}</strong>
          <small>{issue.detail}</small>
        </button>
      ))}
    </div>
  );
}
