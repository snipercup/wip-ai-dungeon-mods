/// <reference path="../state-engine.d.ts" />
const { chain, partition, fromPairs, tuple } = require("../../utils");
const { addStateEntry } = require("../registry");
const { isRelation } = require("../StateEngineEntry");
const { EngineEntryForWorldInfo, parsers } = require("../EngineEntryForWorldInfo");

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
     * A special type checker for this entry; an `undefined` type will be treated as
     * a vanilla entry.
     * 
     * @param {string | undefined} type 
     * @returns {boolean}
     */
    static checkType(type) {
      return typeof type !== "string" || super.checkType(type);
    }

    /**
     * @param {WorldInfoEntry} worldInfo
     * @returns {Omit<StateEngineData, "entryId">}
     */
    parse(worldInfo) {
      const { keys } = worldInfo;
      /** @type {AnyMatcherDef[]} */
      const matchers = keys
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .map((text) => {
          const matcher = parsers.matcher(text);
          if (matcher) return matcher;
          // Fall back on a simple inclusive keyword.
          /** @type {KeywordDef<"include">} */
          const result = { type: "include", exactMatch: false, value: text };
          return result;
        });

      // @ts-ignore - TS is stupid with defaults in destructuring.
      const { relations = [], keywords = [] } = chain(matchers)
        .map((matcher) => isRelation(matcher) ? tuple("relations", matcher) : tuple("keywords", matcher))
        .thru((kvps) => partition(kvps))
        .value((kvps) => fromPairs(kvps));

      return { keys: [], type: "VanillaEntry", relations, keywords };
    }
  }

  addStateEntry(VanillaEntry);
};

/** @type {StateModule} */
exports.stateModule = {
  pre: [init]
};