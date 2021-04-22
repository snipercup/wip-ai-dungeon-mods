declare interface GameState {
  /**
   * Stores the last turn the director associated a `Director` to an `authorsNote`
   * source.  It will hold on the current note for a few turns before changing it.
   */
  $$lastTurnForDirector?: number;
}