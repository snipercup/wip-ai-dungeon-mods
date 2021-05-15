interface CommonModeEntry {
  text: string;
  priority: number | null;
  score: number;
  keys?: Set<string>;
  relations?: AnyRelationDef[];
}

interface CommonModeConfig {
  /** The text to place on a line before the notes. */
  notesHeader: string;
  /** The text to place on a line after the notes.  */
  notesBreak: string;
  /** The text introducing the author's note. */
  authorsNoteText: string;
}