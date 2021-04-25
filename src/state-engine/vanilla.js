/// <reference path="./state-engine.d.ts" />
const { tuple } = require("../utils");
const { isParamsFor } = require("./utils");
const { addStateEntry } = require("./registry");
const { StateEngineEntry } = require("./StateEngineEntry");

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
  class VanillaEntry extends StateEngineEntry {
    static get forType() { return "VanillaEntry"; }
    get targetSources() { return tuple("history"); }

    /**
     * @param {WorldInfoEntry} worldInfo
     * @returns {StateEngineData}
     */
    parse(worldInfo) {
      const { id, keys } = worldInfo;
      return {
        infoId: id,
        infoKey: keys,
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