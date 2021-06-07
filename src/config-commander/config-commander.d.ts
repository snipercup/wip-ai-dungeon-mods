namespace ConfigCommander {
  /** The allowed types for config values, as strings. */
  type ConfigType = "string" | "number" | "integer" | "boolean";

  /** The allowed types for config values, as their actual values. */
  type ConfigValue = string | number | boolean;

  /** Stores the map of configuration values. */
  type ConfigData = Record<string, ConfigValue>;

  /** Stores namespaced data for configuration. */
  type ConfigStore = Record<string, ConfigData>;
}

declare interface GameState {
  /** Storage for Config-Commander. */
  $$configCommanderStore?: ConfigCommander.ConfigStore;

  /** An array of a `$Config` entries that have already been executed. */
  $$configCommanderExec?: string[];
}