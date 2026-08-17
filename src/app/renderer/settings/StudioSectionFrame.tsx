import type { ReactNode } from 'react';
import type { StudioSectionId } from './health';
import { sectionById } from './studio-sections';

interface Props {
  sectionId: StudioSectionId;
  titleSuffix?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function StudioSectionFrame({ sectionId, titleSuffix, actions, children }: Props) {
  const section = sectionById(sectionId);
  return (
    <section className="studio-section-frame" aria-labelledby={`studio-section-${section.id}`}>
      <div className="section-heading">
        <div>
          <span className="section-eyebrow">{section.eyebrow}</span>
          <h2 id={`studio-section-${section.id}`}>{section.title}{titleSuffix ?? ''}</h2>
          <p>{section.description}</p>
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      <div className="section-content">{children}</div>
    </section>
  );
}
