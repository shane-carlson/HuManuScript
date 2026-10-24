export interface CharacterNote {
  id: string;
  name: string;
  body: string;
}

export interface SceneNote {
  id: string;
  blockId: string;
  body: string;
}

export interface BookNotes {
  characters: CharacterNote[];
  scenes: SceneNote[];
  /** Set when saved notes could not be read. Not a character or a scene. */
  unreadable?: boolean;
}

export type NotesPanelPhase = 'loading' | 'error' | 'empty' | 'ready';

export function emptyNotes(): BookNotes {
  return { characters: [], scenes: [] };
}

function isCharacter(value: unknown): value is CharacterNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as CharacterNote;
  return typeof note.id === 'string' && note.id.length > 0 && typeof note.name === 'string' && typeof note.body === 'string';
}

function isScene(value: unknown): value is SceneNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as SceneNote;
  return typeof note.id === 'string' && note.id.length > 0 && typeof note.blockId === 'string' && typeof note.body === 'string';
}

/** Keep well-formed notes. A broken object is marked unreadable instead of throwing away the book. */
export function readBookNotes(value: unknown): BookNotes | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return { characters: [], scenes: [], unreadable: true };
  const raw = value as Partial<BookNotes>;
  if (raw.unreadable === true) return { characters: [], scenes: [], unreadable: true };
  if (!Array.isArray(raw.characters) || !Array.isArray(raw.scenes)) {
    return { characters: [], scenes: [], unreadable: true };
  }
  const characters = raw.characters.filter(isCharacter).map((note) => ({
    id: note.id,
    name: note.name,
    body: note.body,
  }));
  const scenes = raw.scenes.filter(isScene).map((note) => ({
    id: note.id,
    blockId: note.blockId,
    body: note.body,
  }));
  if (!characters.length && !scenes.length) return undefined;
  return { characters, scenes };
}

export function notesPanelPhase(args: { ready: boolean; unreadable: boolean; count: number }): NotesPanelPhase {
  if (!args.ready) return 'loading';
  if (args.unreadable) return 'error';
  if (args.count === 0) return 'empty';
  return 'ready';
}
