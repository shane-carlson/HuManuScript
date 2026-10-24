import { certificationSummary, manuscriptStats, type ManuscriptDocument } from '../core/document.ts';
import { WordGoal } from './WordGoal.tsx';

export function ManuscriptStatsBar({
  doc,
  bookId,
  compact = false,
  activeBlockId = null,
  saveError = null,
  onChange,
}: {
  doc: ManuscriptDocument;
  bookId: string;
  compact?: boolean;
  activeBlockId?: string | null;
  saveError?: string | null;
  onChange: (doc: ManuscriptDocument) => void;
}) {
  const stats = manuscriptStats(doc.blocks);
  const seals = certificationSummary(doc);
  return (
    <section className={`manuscript-stats-bar${compact ? ' is-compact' : ''}`} aria-label="Manuscript statistics">
      <dl className="stats stats--bar stats--bar-one-row">
        <div>
          <dt>Words</dt>
          <dd data-stat="words">{stats.words}</dd>
        </div>
        <div>
          <dt>Certified</dt>
          <dd data-stat="certified">{seals.certified}</dd>
        </div>
        <div>
          <dt>Uncertified</dt>
          <dd data-stat="uncertified">{seals.uncertified}</dd>
        </div>
        <div>
          <dt>Chapters</dt>
          <dd data-stat="chapters">{stats.chapters}</dd>
        </div>
      </dl>
      <WordGoal
        bookId={bookId}
        doc={doc}
        activeBlockId={activeBlockId}
        saveError={saveError}
        onChange={onChange}
      />
    </section>
  );
}
