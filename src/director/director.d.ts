declare interface GameState {
  /**
   * Stores the last section the director emitted a note during.  A section
   * sub-divides the actions into parts of 12 actions.  A new note is only
   * emitted when the section changes.
   * 
   * Tracking the turns like this allows it to tollerate undo/redo better,
   * without having to break out a turn-cache.
   */
  $$currentDirectorSection?: number;
}