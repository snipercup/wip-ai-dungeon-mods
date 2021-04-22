declare module "aid-bundler/src/aidData" {
  interface AIDData {
    /** The current AI-generated summary. */
    summary: string;
  }
}

declare interface GameState {
  /**
   * Whether to announce summary changes in a message.  This allows the player to
   * more easily proof-read or validate the reasonability of a summary when one
   * is produced.
   */
  $$reportSummary?: boolean;

  /**
   * Set when a summary change is detected in the input modifier.  Since AID-Bundler
   * nukes the `message` at every step of the modifier sequence, this property
   * tells the output modifier to set a message to display the `$$latestSummary`
   * to the player.
   */
  $$reportSummaryInOutputModifier?: boolean;

  /**
   * The latest summary from a detected update.
   * 
   * Used to determine when cache updates need to happen, especially when an undo
   * has happened, as we want to use the summary from the cache instead of the one
   * in the player's memory until the AI updates it.
   */
  $$latestSummary?: string;

  /**
   * If the `set-authors-note` command was used to set a note, this will be `true`.
   * 
   * Since AI Dungeon's script API currently does not provide access to the note
   * that can be set in the "Pin" menu, this command is the next best thing, but
   * certain scripts may not want to overwrite the player's manual settings.
   */
  $$setAuthorsNote?: boolean;
}