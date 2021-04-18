/// <reference path="../state-engine/state-engine.d.ts" />
const { isParamsFor } = require("../state-engine/utils");
const { addStateEntry } = require("../state-engine/core");
const { StateEngineEntry } = require("../state-engine/StateEngineEntry");

/**
 * A simple state entry type for the vanilla world info, for backward compatibility
 * with the standard system.
 */

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
 const init = () => {
  class VanillaEntry extends StateEngineEntry {
    static get forType() { return "VanillaEntry"; }

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

    /**
     * @param {MatchableEntry} matcher 
     * @param {AssociationParams} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      // Only applies to history entries.
      if (!isParamsFor("history", params)) return false;
      // Will use all standard stuff, besides this.
      return super.associator(matcher, params);
    }
  }

  addStateEntry(VanillaEntry);
};

/** @type {StateModule} */
module.exports.stateModule = {
  pre: [init]
};