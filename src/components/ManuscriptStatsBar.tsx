import { certificationSummary, manuscriptStats, type ManuscriptDocument } from '../core/document.ts';

export function ManuscriptStatsBar({ doc, compact = false }: { doc: ManuscriptDocument; compact?: boolean }) {
  const stats = manuscriptStats(doc.blocks);
  const seals = certificationSummary(doc);
  return (
    <section className={`manuscript-stats-bar${compact ? ' is-compact' : ''}`} aria-label="Manuscript statistics">
      <dl className="stats stats--bar stats--bar-one-row">
        <div>
          <dt>Words</dt>
          <dd>{stats.words}</dd>
        </div>
        <div>
          <dt>Certified</dt>
          <dd>{seals.certified}</dd>
        </div>
        <div>
          <dt>Uncertified</dt>
          <dd>{seals.uncertified}</dd>
        </div>
        <div>
          <dt>Chapters</dt>
          <dd>{stats.chapters}</dd>
        </div>
      </dl>
    </section>
  );
}
