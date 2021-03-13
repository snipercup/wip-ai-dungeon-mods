/// <reference path="../state-engine/state-engine.d.ts" />
const { dew, getText, rollDice } = require("../utils");
const { addStateEntry, checkKeywords, iterUsedKeys } = require("../state-engine/core");

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
   * @param {StateEngineData} stateData 
   * @returns {StateEngineData}
   */
  const addKeyAsKeyword = (stateData) => {
    // Should not happen; to make TS happy.
    if (!stateData.key) return stateData;

    const keywordSet = new Set(stateData.include);
    if (keywordSet.has(stateData.key)) return stateData;
    keywordSet.add(stateData.key);
    stateData.include = [...keywordSet];
    return stateData;
  };

  addStateEntry("Player", {
    priority: 100,
    validator(stateData) {
      const issues = [];
      if (!stateData.key)
        issues.push(`World info entry \`${stateData.infoKey}\` must have a key.`);
      if (stateData.relations.length)
        issues.push(`World info entry \`${stateData.infoKey}\` cannot have relations.`);
      return issues;
    },
    modifier: addKeyAsKeyword,
    /** @type {StateAssociationBaseFn} */
    associator(matcher, source) {
      // Always include it implicitly when there's only a single player.
      if (source === "implicit" && info.characters.length <= 1) return true;
      // Use the default associator, otherwise.
      return undefined;
    },
    postRules(matcher, source, score, neighbors) {
      // Always retain when implicit.
      if (source === "implicit") return true;
      // Always drop for any other source, except for the history.
      if (typeof source !== "number") return false;
      // If this entry is already included implicitly, drop this association.
      for (const [otherEntry] of neighbors.getFor("implicit"))
        if (otherEntry.infoId === matcher.infoId) return false;
      return false;
    }
  });

  addStateEntry("NPC", {
    priority: 90,
    validator(stateData) {
      const issues = [];
      if (!stateData.key)
        issues.push(`World info entry \`${stateData.infoKey}\` must have a key.`);
      if (stateData.relations.length)
        issues.push(`World info entry \`${stateData.infoKey}\` cannot have relations.`);
      return issues;
    },
    modifier: addKeyAsKeyword,
    /** @type {StateAssociationBaseFn} */
    associator(matcher, source) {
      const diceSize = npcImplicitInclusionDiceSides;
      // Has a chance of being implicitly included.
      if (source === "implicit") return rollDice(1, diceSize) === diceSize;
      // Otherwise, only valid when processing the `history` and current `text`.
      if (typeof source !== "number") return false;
      // Use the default associator from here on.
      return undefined;
    }
  });

  addStateEntry("Location", {
    priority: 50,
    validator(stateData) {
      const issues = [];
      if (stateData.key)
        issues.push(`World info entry \`${stateData.infoKey}\` cannot be given a key.`);
      if (stateData.include.length || stateData.exclude.length)
        issues.push(`World info entry \`${stateData.infoKey}\` cannot be given keywords.`);
      return issues;
    },
    /** @type {StateAssociationBaseFn} */
    associator(matcher, source) {
      // Only associate implicitly.
      return source === "implicit";
    }
  });

  /** @type {Set<StateEngineEntry["infoId"]>} */
  const loreWithMatchedStates = new Set();

  addStateEntry("Lore", {
    validator() {
      // Anything goes with lore entries.
      return [];
    },
    preRules(matcher, source, neighbors) {
      // Do some pre-processing, looking for matching `State` entries that
      // reference this `Lore`.
      const { key, infoId } = matcher.stateEntry;
      if (!key) return true;

      for (const [otherEntry] of neighbors.after()) {
        if (otherEntry.type !== "State") continue;
        if (!otherEntry.relations.includes(key)) continue;
        loreWithMatchedStates.add(infoId);
      }

      return true;
    },
    /** @type {StateValuatorBaseFn} */
    valuator(matcher) {
      // Give a boost if this `Lore` was referenced by a later `State`.
      if (loreWithMatchedStates.has(matcher.infoId)) return 5;
      return undefined;
    }
  });

  addStateEntry("State", {
    validator(stateData) {
      const issues = [];
      if (!stateData.key)
        issues.push(`World info entry \`${stateData.infoKey}\` must have a key.`);
      return issues;
    },
    modifier(stateData, allStates) {
      if (stateData.key == null) return stateData;

      // If a `$State` has the same `key` as another entry of a different type,
      // We'll implicitly make it related to it.
      const duplicateEntries = allStates
        .filter((sd) => sd.type !== stateData.type)
        .filter((sd) => sd.key === stateData.key);
      
      if (duplicateEntries.length === 0) return stateData;

      const addedRelation = new Set([...stateData.relations, stateData.key]);
      stateData.relations = [...addedRelation];
      return stateData;
    },
    /** @type {StateAssociationBaseFn} */
    associator(matcher, source, entry, usedKeys) {
      const { stateEntry: stateData } = matcher;

      // Only valid when processing the `history` and current `text`.
      if (!usedKeys || typeof source !== "number") return false;
      // Use the default matcher if we have no relations to worry about.
      if (stateData.relations.length === 0) return undefined;

      // First, check the keywords.
      if (!checkKeywords(matcher, getText(entry))) return false;

      // The "State" type is a little bit different.  It's for immediately relevant
      // information.  When it has relations, we want to only associate this with
      // entries that are nearby to the related matches.  We define this as being
      // within 3 history entries.
      const validForRelations = dew(() => {
        if (stateData.relations.length === 0) return true;
        const nearbyUsedKeys = new Set(iterUsedKeys(usedKeys, source, source + 2));
        return stateData.relations.every((key) => nearbyUsedKeys.has(key));
      });
      if (!validForRelations) return false;
      if (!stateData.key) return true;

      // If our `key` is also used in one of our relations, do not add it to
      // the `usedKeys` map, but do associate with the source.
      if (stateData.relations.includes(stateData.key)) return true;
  
      const theKeys = usedKeys.get(source) ?? new Set();
      theKeys.add(stateData.key);
      usedKeys.set(source, theKeys);
      return true;
    },
    valuator() {
      // Give these entries a higher priority.
      return 10;
    },
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
  });
};

module.exports.stateModule = {
  pre: [init]
};