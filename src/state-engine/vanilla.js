/// <reference path="./state-engine.d.ts" />
const { tuple } = require("../utils");
const { addStateEntry } = require("./registry");
const { EngineEntryForWorldInfo } = require("./EngineEntryForWorldInfo");

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
 const init = () => {
  /**
   * A simple state entry type for the vanilla world info, for backward compatibility
   * with the standard system.
   */
  class VanillaEntry extends EngineEntryForWorldInfo {
    static get forType() { return "VanillaEntry"; }
    get targetSources() { return tuple("history"); }

    /**
     * @param {WorldInfoEntry} worldInfo
     * @returns {Omit<StateEngineData, "entryId">}
     */
    parse(worldInfo) {
      const { keys } = worldInfo;
      return {
        key: null,
        type: "VanillaEntry",
        relations: [],
        include: keys.split(",").map(s => s.trim()).filter(Boolean),
        exclude: []
      };
    }
  }

  addStateEntry(VanillaEntry);
};

/** @type {StateModule} */
exports.stateModule = {
  pre: [init]
};