/// <reference path="./director.d.ts" />
/// <reference path="../state-engine/state-engine.d.ts" />
const { tuple } = require("../utils");
const { isParamsFor } = require("../state-engine/utils");
const { addStateEntry } = require("../state-engine/registry");

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
 const init = (data) => {
  const { EngineEntryForWorldInfo } = require("../state-engine/EngineEntryForWorldInfo");

  /**
   * When this state matches any history entry, it will provide text for the
   * Author's Note.  Use it to give direction to the AI when certain moods,
   * characters, or events are detected in the text.
   * 
   * Note: if something else is setting the Author's Note before State Engine
   * runs, this entry won't even be considered for matching.
   * 
   * Supports matching through:
   * - Keywords
   * - Relations
   */
  class DirectionEntry extends EngineEntryForWorldInfo {
    /**
     * @param {WorldInfoEntry} worldInfo
     */
    constructor(worldInfo) {
      super(worldInfo);

      /**
       * The number of history sources this entry was able to match.
       * At least one history source must match for this entry to obtain a
       * non-zero score.
       */
      this.historyMatches = 0;
    }

    static get forType() { return "Direction"; }
    get targetSources() { return tuple("authorsNote", "history"); }

    validator() {
      const issues = super.validator();
      if (this.keys.size > 1)
        issues.push(`World info entry \`${this.infoKey}\` can have, at most, one key.`);
      return issues;
    }

    /**
     * @param {Map<string, StateDataForModifier>} allStates
     * @returns {void}
     */
    modifier(allStates) {
      // If we have a single key and no relations, and some entry exists that shares
      // the key, use the key as a relation implicitly.
      if (this.keys.size !== 1 || this.relations.length > 0) return;
      const [mainKey] = this.keys;
      for (const [, entry] of allStates) {
        if (entry.type === this.type) continue;
        if (!entry.keys.has(mainKey)) continue;
        /** @type {RelationDef<"allOf">} */
        const newRel = { type: "allOf", key: mainKey };
        this.relations = [...this.relations, newRel];
        return;
      }
    }

    /**
     * @param {MatchableEntry} matcher 
     * @param {AssociationParamsFor<this>} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      // Associates for the Author's Note source, exclusively.
      if (isParamsFor("authorsNote", params)) return true;

      // We want to also check the recent history too.  The latest 5 history
      // sources should do the trick.  We'll increment `historyMatches` if we
      // match one.
      if (params.source >= 5) return false;
      if (!this.checkKeywords(matcher, params)) return false;
      if (!this.checkRelations(matcher, params)) return false;
      this.historyMatches += 1;

      // But we're still not associating with history entries.
      return false;
    }

    valuator() {
      // Give 10 points for every history entry matched.  If we matched no
      // entries, our score will be `0` and the association will be dropped.
      return 10 * this.historyMatches;
    }

    postRules() {
      // The last selected entry will be held for 12 actions before an opportunity
      // to change it again is allowed.
      const { actionCount, state: { $$currentDirectorSection } } = data;
      const currentSection = (actionCount / 12) | 0;
      checks: {
        if ($$currentDirectorSection == null) break checks;
        if ($$currentDirectorSection !== currentSection) break checks;
        return false;
      }
      data.state.$$currentDirectorSection = currentSection;
      return true;
    }
  }

  addStateEntry(DirectionEntry);
};

/** @type {StateModule} */
exports.stateModule = {
  pre: [init]
};