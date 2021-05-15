/// <reference path="../state-engine/state-engine.d.ts" />
const { tuple, chain, rollDice } = require("../utils");
const { addStateEntry } = require("../state-engine/registry");
const { isParamsFor } = require("../state-engine/utils");

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
  const { EngineEntryForWorldInfo } = require("../state-engine/EngineEntryForWorldInfo");
  const { RelatableEntry } = require("../state-engine/RelatableEntry");
  const { isExclusiveKeyword, isInclusiveKeyword, isRelationOfType } = require("../state-engine/StateEngineEntry");
  /** @type {(relDef: AnyRelationDef) => boolean} */
  const isNegatedRelation = (relDef) => isRelationOfType(relDef, "negated");
  /** @type {(relDef: AnyRelationDef) => boolean} */
  const isInclusiveRelation = (relDef) => !isNegatedRelation(relDef);

  const { info } = data;

  /**
   * We implicitly include the first string in `keys` for `Player` and `NPC` as a keyword.
   * 
   * @param {StateEngineEntry} entry 
   * @returns {void}
   */
  const addKeyAsKeyword = (entry) => {
    const [mainKey] = entry.keys;
    if (!mainKey) return;
    const hasMainKey = entry.keywords.some((kw) => kw.type === "include" && kw.value === mainKey);
    if (hasMainKey) return;
    entry.keywords.push({ type: "include", exactMatch: true, value: mainKey });
  };

  class PlayerEntry extends EngineEntryForWorldInfo {
    static get forType() { return "Player"; }
    get targetSources() { return tuple("implicit", "history"); }
    get priority() { return 100; }

    validator() {
      const issues = super.validator();
      if (!this.keys.size)
        issues.push(`World info entry \`${this.infoKey}\` must have at least one key.`);
      if (this.relations.length)
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
        if (otherEntry.entryId === this.entryId) return false;
      return true;
    }
  }

  class NpcEntry extends EngineEntryForWorldInfo {
    static get forType() { return "NPC"; }
    get targetSources() { return tuple("implicit", "history"); }
    get priority() { return 90; }

    validator() {
      const issues = super.validator();
      if (!this.keys.size)
        issues.push(`World info entry \`${this.infoKey}\` must have at least one key.`);
      if (this.relations.length)
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

  class LocationEntry extends EngineEntryForWorldInfo {
    static get forType() { return "Location"; }
    get targetSources() { return tuple("implicit"); }
    get priority() { return 50; }

    validator() {
      const issues = super.validator();
      if (this.keys.size)
        issues.push(`World info entry \`${this.infoKey}\` cannot be given a key.`);
      if (this.relations.length || this.keywords.length)
        issues.push(`World info entry \`${this.infoKey}\` cannot have any matchers.`);
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

  class LoreEntry extends EngineEntryForWorldInfo {
    /**
     * @param {WorldInfoEntry} worldInfo
     */
    constructor(worldInfo) {
      super(worldInfo);

      this.hasMatchedStateEntry = false;
    }

    static get forType() { return "Lore"; }
    get targetSources() { return tuple("history"); }

    /**
     * @param {Map<string, StateDataForModifier>} allStates
     * @returns {void}
     */
    modifier(allStates) {
      if (this.keys.size === 0) return;
      if (this.keywords.some(isInclusiveKeyword)) return;
      if (this.relations.some(isInclusiveRelation)) return;

      // If a `$Lore` has the same `keys` as another entry of the same type,
      // and this entry lacks inclusive matchers, but the other does not, we'll
      // copy those matchers to this entry.  This makes it a little less irritating
      // to create multiple lore entries for the same concept or thing.
      // Only works for lore entries with no exclusion keywords or negated relations.
      const duplicateEntries = chain(allStates.values())
        .filter((sd) => {
          // Must be the same type.
          if (sd.type !== this.type) return false;
          // Must also have keys defined.
          if (sd.keys.size === 0) return false;
          // Must have the same keys. This is basically, `sd.keys === this.keys`, but
          // stupid because `Set` has none of the actual set operations on it.
          // If they are not the same, the size will increase.
          const joinedSet = new Set([...sd.keys, ...this.keys]);
          if (joinedSet.size !== this.keys.size) return false;
          // Cannot have any negative matchers of any kind.
          if (sd.keywords.some(isExclusiveKeyword)) return false;
          if (sd.relations.some(isNegatedRelation)) return false;
          // But it does need to have at least one positive matcher.
          const matcherCount = sd.keywords.length + sd.relations.length;
          if (matcherCount === 0) return false;
          return true;
        })
        .toArray();

      // Must be exactly one match for this to apply.
      if (duplicateEntries.length !== 1) return;

      const [chosenEntry] = duplicateEntries;
      this.keywords = [...chosenEntry.keywords];
      this.relations = [...chosenEntry.relations];
    }

    /**
     * If a`$Lore` entry lacks keywords, we limit the range the relations can match
     * to only the current history entry and the one immediately before it.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationParamsFor<this>} params
     * @returns {boolean}
     * Whether this entry's relations were satisfied for this source.
     */
     checkRelations(matcher, params) {
      if (this.keywords.length) return super.checkRelations(matcher, params);
      if (!isParamsFor("history", params)) return false;
      const { source, usedKeys } = params;

      if (this.relations.length === 0) return true;
      const result = this.relator.check(usedKeys, source, source + 1);
      if (result === false) return false;
      this.relationCounts.set(source, result);
      return true;
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
      const { keys } = this;
      if (keys.size === 0) return true;

      // Later states only, because we don't want this lore entry over
      // shadowing the more important state entry.
      for (const [otherEntry] of neighbors.after()) {
        if (otherEntry.type !== "State") continue;
        if (!otherEntry.relator.checkKeys(keys)) continue;
        this.hasMatchedStateEntry = true;
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
      const scalar = this.hasMatchedStateEntry ? 2 : 1;
      return super.valuator(matcher, source, entry, scalar);
    }
  }

  class StateEntry extends EngineEntryForWorldInfo {
    static get forType() { return "State"; }
    get targetSources() { return tuple("history"); }

    validator() {
      const issues = super.validator();
      if (this.keys.size > 1)
        issues.push(`World info entry \`${this.infoKey}\` cannot have more than one key.`);
      return issues;
    }

    /**
     * The "State" type is a little bit different.  It's for immediately relevant
     * information.  When it has relations, we want to only associate this with
     * entries that are nearby to the related matches.  We define this as being
     * the current history entry and the two immediately before it.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationParamsFor<this>} params
     * @returns {boolean}
     * Whether this entry's relations were satisfied for this source.
     */
    checkRelations(matcher, params) {
      if (!isParamsFor("history", params)) return false;
      const { source, usedKeys } = params;

      if (this.relations.length === 0) return true;
      const result = this.relator.check(usedKeys, source, source + 2);
      if (result === false) return false;
      this.relationCounts.set(source, result);
      return true;
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
      return curCount < 2;
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