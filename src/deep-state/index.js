/// <reference path="../state-engine/state-engine.d.ts" />
const { tuple, chain, rollDice } = require("../utils");
const { addStateEntry } = require("../state-engine/registry");
const { isParamsFor } = require("../state-engine/utils");
const { StateEngineEntry, iterUsedKeys } = require("../state-engine/StateEngineEntry");

// Configuration.
/** NPC may be implicitly included based on chance. */
const npcImplicitInclusionDiceSides = 20;

/**
 * Deep State Module
 * 
 * Provides specialized entries that can relate to each other, in an effort
 * to provide more contextual information to the AI.
 * 
 * The following entry types are supported:
 * - `$Player` - A player information entry.
 * - `$NPC` - One of these entries may be selected to appear based on
 *   usages of their name in the history and other resources.  Even if there
 *   is no mention, it may appear just to remind the AI of their existence.
 * - `$Location` - A special entry that will always be included.
 * - `$Lore` - A low priority entry...
 * - `$State` - A high priority entry that may be included based
 *   on the results of a keyword search.
 * 
 * Keywords in entries that support them must be separated by semi-colons; this
 * is to prevent their selection by the usual world info matching rules.
 */

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
const init = (data) => {
  const { info } = data;

  /**
   * We implicitly include the `key` for `Player` and `NPC` as a keyword.
   * 
   * @param {StateEngineEntry} entry 
   * @returns {void}
   */
  const addKeyAsKeyword = (entry) => {
    // Should not happen; to make TS happy.
    if (!entry.key) return;
    if (entry.include.has(entry.key)) return;
    entry.include.add(entry.key);
  };

  class PlayerEntry extends StateEngineEntry {
    static get forType() { return "Player"; }
    get targetSources() { return tuple("implicit", "history"); }
    get priority() { return 100; }

    validator() {
      const issues = super.validator();
      if (!this.key)
        issues.push(`World info entry \`${this.infoKey}\` must have a key.`);
      if (this.relations.size)
        issues.push(`World info entry \`${this.infoKey}\` cannot have relations.`);
      return issues;
    }

    modifier() {
      // Add the character's name as a keyword.
      addKeyAsKeyword(this);
    }

    /**
     * @param {MatchableEntry} matcher 
     * @param {AssociationParamsFor<this>} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      // Always include it implicitly when there's only a single player.
      if (isParamsFor("implicit", params) && info.characters.length <= 1) return true;
      // Use the default associator, otherwise.
      return super.associator(matcher, params);
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      // Give a flat score, if it's an implicit match.
      if (source === "implicit") return 50;
      // Otherwise, boost them up to the level of `$State` entries.
      return super.valuator(matcher, source, entry, 5);
    }

    /**
     * @param {MatchableEntry} matcher 
     * @param {AssociationSourcesFor<this>} source 
     * @param {number} score 
     * @param {PostRuleIterators} neighbors 
     * @returns {boolean}
     */
    postRules(matcher, source, score, neighbors) {
      // Always retain when implicit.
      if (source === "implicit") return true;
      // Always drop for any other source, except for the history.
      if (typeof source !== "number") return false;
      // If this entry is already included implicitly, drop this association.
      for (const [otherEntry] of neighbors.getFor("implicit"))
        if (otherEntry.infoId === this.infoId) return false;
      return false;
    }
  }

  class NpcEntry extends StateEngineEntry {
    static get forType() { return "NPC"; }
    get targetSources() { return tuple("implicit", "history"); }
    get priority() { return 90; }

    validator() {
      const issues = super.validator();
      if (!this.key)
        issues.push(`World info entry \`${this.infoKey}\` must have a key.`);
      if (this.relations.size)
        issues.push(`World info entry \`${this.infoKey}\` cannot have relations.`);
      return issues;
    }

    modifier() {
      // Add the character's name as a keyword.
      addKeyAsKeyword(this);
    }

    /**
     * @param {MatchableEntry} matcher 
     * @param {AssociationParamsFor<this>} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      const diceSize = npcImplicitInclusionDiceSides;
      // Has a chance of being implicitly included.
      if (isParamsFor("implicit", params)) return rollDice(1, diceSize) === diceSize;
      // Otherwise, use the default associator from here on.
      return super.associator(matcher, params);
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      // Give a flat score if it only won the dice roll.
      if (source === "implicit") return 25;
      // Give these entries a boost if they're referenced in the text.
      return super.valuator(matcher, source, entry, 4);
    }
  }

  class LocationEntry extends StateEngineEntry {
    static get forType() { return "Location"; }
    get targetSources() { return tuple("implicit"); }
    get priority() { return 50; }

    validator() {
      const issues = super.validator();
      if (this.key)
        issues.push(`World info entry \`${this.infoKey}\` cannot be given a key.`);
      if (this.include.size || this.exclude.size)
        issues.push(`World info entry \`${this.infoKey}\` cannot be given keywords.`);
      return issues;
    }

    associator() {
      // Only associates implicitly.
      return true;
    }

    valuator() {
      // Give these entries a flat score.
      return 40;
    }
  }

  /** @type {Set<StateEngineEntry["infoId"]>} */
  const loreWithMatchedStates = new Set();

  class LoreEntry extends StateEngineEntry {
    static get forType() { return "Lore"; }
    get targetSources() { return tuple("history"); }

    /**
     * @param {Map<string, StateDataForModifier>} allStates
     * @returns {void}
     */
    modifier(allStates) {
      if (this.key == null) return;
      if (this.include.size > 0) return;
      const { relations: ownRelations } = this;

      // If a `$Lore` has the same `key` as another entry of the same type,
      // and this entry lacks inclusive keywords, but the other does not, we'll
      // copy those keywords to this entry.  This makes it a little less irritating
      // to create multiple lore entries for the same concept or thing.
      // Only works for lore entries with no exclusion keywords.
      const duplicateEntries = chain(allStates.values())
        .filter((sd) => sd.type === this.type)
        .filter((sd) => sd.key === this.key)
        .filter((sd) => sd.include.size > 0)
        .filter((sd) => sd.exclude.size === 0)
        .filter((sd) => {
          // They must also share the same relations, if they have them.
          if (sd.relations.size !== ownRelations.size) return false;
          for (const otherRel of sd.relations)
            if (!ownRelations.has(otherRel)) return false;
          return true;
        })
        .toArray();
      
      // Must be exactly one match for this to apply.
      if (duplicateEntries.length !== 1) return;

      const [choosenEntry] = duplicateEntries;
      this.include = new Set([...choosenEntry.include]);
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {PreRuleIterators} neighbors
     * @returns {boolean}
     */
    preRules(matcher, source, neighbors) {
      // Do some pre-processing, looking for matching `State` entries that
      // reference this `Lore`.
      const { key, infoId } = this;
      if (!key) return true;

      for (const [otherEntry] of neighbors.after()) {
        if (otherEntry.type !== "State") continue;
        if (!otherEntry.relations.has(key)) continue;
        loreWithMatchedStates.add(infoId);
        break;
      }

      return true;
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      // Give a boost if this `Lore` was referenced by a later `State`.
      // Later states only, because we don't want this lore entry over
      // shadowing the more important state entry.
      const scalar = loreWithMatchedStates.has(matcher.infoId) ? 2 : 1;
      return super.valuator(matcher, source, entry, scalar);
    }
  }

  class StateEntry extends StateEngineEntry {
    static get forType() { return "State"; }
    get targetSources() { return tuple("history"); }

    validator() {
      const issues = super.validator();
      if (!this.key)
        issues.push(`World info entry \`${this.infoKey}\` must have a key.`);
      return issues;
    }

    /**
     * @param {Map<string, StateDataForModifier>} allStates
     * @returns {void}
     */
    modifier(allStates) {
      if (this.key == null) return;

      // If a `$State` has the same `key` as another entry of a different type,
      // we'll implicitly make it related to it.
      const duplicateEntries = chain(allStates.values())
        .filter((sd) => sd.type !== this.type)
        .filter((sd) => sd.key === this.key)
        .toArray();

      if (duplicateEntries.length === 0) return;
      this.relations = new Set([...this.relations, this.key]);
    }

    /**
     * The "State" type is a little bit different.  It's for immediately relevant
     * information.  When it has relations, we want to only associate this with
     * entries that are nearby to the related matches.  We define this as being
     * within 3 history entries.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationParamsFor<this>} params
     * @returns {boolean}
     * Whether this entry's relations were satisfied for this source.
     */
    checkRelations(matcher, params) {
      if (!isParamsFor("history", params)) return false;
      const { source, usedKeys } = params;

      if (this.relations.size === 0) return true;
      const nearbyUsedKeys = new Set(iterUsedKeys(usedKeys, source, source + 2));
      for (const key of this.relations)
        if (!nearbyUsedKeys.has(key)) return false;
      return true;
    }

    /**
     * Only adds the key to `usedKeys` if its key does not appear in its own relations.
     * 
     * @param {AssociationParamsFor<this>} params 
     * @returns {void}
     */
    recordKeyUsage(params) {
      // If our `key` is also used in one of our relations, do not add it to
      // the `usedKeys` map.
      if (!this.key || this.relations.has(this.key)) return;
      super.recordKeyUsage(params);
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      // Give these entries a higher score.
      return super.valuator(matcher, source, entry, 3);
    }

    /**
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {number} score
     * @param {PostRuleIterators} neighbors
     * @returns {boolean}
     */
    postRules(matcher, source, score, neighbors) {
      // Limit to 2 of these.
      let curCount = 0;
      for (const [otherEntry] of neighbors.selected()) {
        if (curCount >= 2) return false;
        if (otherEntry.type !== "State") continue;
        curCount += 1;
      }
      return true;
    }
  }

  addStateEntry(PlayerEntry);
  addStateEntry(NpcEntry);
  addStateEntry(LocationEntry);
  addStateEntry(LoreEntry);
  addStateEntry(StateEntry);
};

exports.stateModule = {
  pre: [init]
};