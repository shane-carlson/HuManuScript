import { certificationSummary } from './document.ts';
import { bookDisplayTitle, groupLibraryBooks, seriesMembershipLabel, type Book, type Library } from './library.ts';
import { manuscriptStats } from './manuscript.ts';

export interface WritingCount {
  books: number;
  words: number;
  chapters: number;
  certified: number;
  uncertified: number;
}

export interface BookStatLine {
  id: string;
  title: string;
  seriesLabel: string | null;
  counts: WritingCount;
}

export interface SeriesStatLine {
  id: string;
  name: string;
  counts: WritingCount;
  books: BookStatLine[];
}

export interface LibraryWritingStats {
  totals: WritingCount;
  series: SeriesStatLine[];
  standalone: BookStatLine[];
  standaloneCounts: WritingCount;
}

export function emptyWritingCount(): WritingCount {
  return { books: 0, words: 0, chapters: 0, certified: 0, uncertified: 0 };
}

function addCounts(total: WritingCount, next: WritingCount): WritingCount {
  return {
    books: total.books + next.books,
    words: total.words + next.words,
    chapters: total.chapters + next.chapters,
    certified: total.certified + next.certified,
    uncertified: total.uncertified + next.uncertified,
  };
}

export function bookWritingCount(book: Book): WritingCount {
  const stats = manuscriptStats(book.document.blocks);
  const seals = certificationSummary(book.document);
  return {
    books: 1,
    words: stats.words,
    chapters: stats.chapters,
    certified: seals.certified,
    uncertified: seals.uncertified,
  };
}

function bookLine(book: Book, seriesName?: string): BookStatLine {
  return {
    id: book.id,
    title: bookDisplayTitle(book),
    seriesLabel: seriesMembershipLabel(book, seriesName),
    counts: bookWritingCount(book),
  };
}

export function libraryWritingStats(library: Library): LibraryWritingStats {
  const groups = groupLibraryBooks(library.books, library.series);
  const series: SeriesStatLine[] = [];
  const standalone: BookStatLine[] = [];
  let totals = emptyWritingCount();
  let standaloneCounts = emptyWritingCount();

  for (const group of groups) {
    if (!group.heading) {
      for (const book of group.books) {
        const line = bookLine(book);
        standalone.push(line);
        standaloneCounts = addCounts(standaloneCounts, line.counts);
        totals = addCounts(totals, line.counts);
      }
      continue;
    }
    const books = group.books.map((book) => bookLine(book, group.heading ?? undefined));
    const counts = books.reduce((sum, book) => addCounts(sum, book.counts), emptyWritingCount());
    series.push({ id: group.id, name: group.heading, counts, books });
    totals = addCounts(totals, counts);
  }

  return { totals, series, standalone, standaloneCounts };
}
