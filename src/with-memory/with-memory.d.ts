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
   * The latest summary from a detected update.
   * 
   * Used to determine when cache updates need to happen, especially when an undo
   * has happened, as we want to use the summary from the cache instead of the one
   * in the player's memory until the AI updates it.
   */
  $$latestSummary?: string;
}