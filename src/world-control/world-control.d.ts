declare interface GameState {
  /**
   * Acts more or less as a `Set`, recording `WorldInfoEntry` that were hidden
   * at the time the plugin was installed or the game started so their hidden
   * state can be toggled on demand.
   */
  $$worldInfoVisibility?: Record<WorldInfoEntry["id"], boolean>;
}