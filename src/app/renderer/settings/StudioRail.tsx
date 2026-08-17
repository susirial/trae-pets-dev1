import type { ReactNode } from 'react';
import type { StudioSectionId } from './health';
import { STUDIO_SECTIONS } from './studio-sections';

interface Props {
  activeSection: StudioSectionId;
  onChange(section: StudioSectionId): void;
}

function RailIcon({ id }: { id: StudioSectionId }) {
  const paths: Record<StudioSectionId, ReactNode> = {
    overview: (
      <>
        <path d="M4.5 10.5 12 4l7.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    role: (
      <>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20c.55-4 2.7-6 6.5-6s5.95 2 6.5 6" />
      </>
    ),
    stage: (
      <>
        <path d="M4 6.5h16v11H4z" />
        <path d="M8 21h8M12 17.5V21" />
        <path d="m9.5 11 1.65 1.65L15 9" />
      </>
    ),
    interaction: (
      <>
        <path d="m7 4 10 8-5.1 1.25L9.5 18z" />
        <path d="m13.5 14.5 3.5 4" />
      </>
    ),
    sound: (
      <>
        <path d="M9.5 18V6.5L18 5v11.5" />
        <ellipse cx="6.5" cy="18" rx="3" ry="2" />
        <ellipse cx="15" cy="16.5" rx="3" ry="2" />
      </>
    ),
    states: (
      <>
        <path d="M5 7h14M5 12h14M5 17h14" />
        <circle cx="8" cy="7" r="1.5" />
        <circle cx="15.5" cy="12" r="1.5" />
        <circle cx="10.5" cy="17" r="1.5" />
      </>
    ),
    resources: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
      </>
    ),
    checks: (
      <>
        <path d="M12 3.5 19 6v5.3c0 4.5-2.7 7.6-7 9.2-4.3-1.6-7-4.7-7-9.2V6z" />
        <path d="m8.5 12 2.25 2.25L15.8 9.2" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        {paths[id]}
      </g>
    </svg>
  );
}

export function StudioRail({ activeSection, onChange }: Props) {
  return (
    <nav className="studio-rail" aria-label="工作室模块">
      <div className="studio-rail-brand" aria-label="TRAE Pets">
        <div className="studio-rail-logo" aria-hidden="true">
          <span>T</span>
          <i />
        </div>
      </div>
      <div className="studio-rail-items">
        {STUDIO_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`studio-rail-item${activeSection === section.id ? ' is-active' : ''}`}
            aria-current={activeSection === section.id ? 'page' : undefined}
            aria-label={`${section.label}：${section.title}`}
            onClick={() => onChange(section.id)}
          >
            <span className="studio-rail-icon"><RailIcon id={section.id} /></span>
            <span className="studio-rail-tooltip" aria-hidden="true">
              <strong>{section.label}</strong>
              <small>{section.title}</small>
            </span>
            <span className="studio-rail-signal" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="studio-rail-footer" aria-hidden="true">
        <span />
      </div>
    </nav>
  );
}
