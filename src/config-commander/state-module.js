const { tuple } = require("../utils");
const { addStateEntry } = require("../state-engine/registry");

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
const init = () => {
  const { EngineEntryForWorldInfo } = require("../state-engine/EngineEntryForWorldInfo");

  /**
   * A dummy State-Engine entry so that the engine doesn't complain that it can't
   * find an entry of the `$Config` type.
   */
   class ConfigEntry extends EngineEntryForWorldInfo {
    /**
     * @param {WorldInfoEntry} worldInfo
     */
    constructor(worldInfo) {
      super(worldInfo);
    }

    static get forType() { return "Config"; }
    get targetSources() { return tuple(); }

    /**
     * Prevents State-Engine from producing these as entries.
     * 
     * @returns {Iterable<StateEngineEntry>}
     */
    static produceEntries() {
      return [];
    }

    /**
     * Hard disables this entry in State-Engine, just in case it finds its way into the
     * system somehow.
     * 
     * @returns {boolean}
     */
    associator() {
      // Never associates, period.
      return false;
    }
  }

  addStateEntry(ConfigEntry);
};

/** @type {StateModule} */
exports.stateModule = {
 pre: [init]
};