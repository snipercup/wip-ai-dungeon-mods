const { entryCount } = require("./config");
const { chain, partition, fromPairs, tuple } = require("../utils");
const { isRelationOfType } = require("./StateEngineEntry");

/**
 * Iterates a `usedKeys` map across a range of entries.
 * Bear in mind that the `start` and `end` are offsets from the latest
 * `history` entry into the past.
 * 
 * So, `0` is the just-now inputted text from the player, and `1` is
 * the last entry in `history`, and `2` is the the next oldest `history`
 * entry, and so on.
 * 
 * @param {UsedKeysMap} usedKeys
 * @param {number} start
 * @param {number} [end]
 * @returns {Iterable<string>}
 */
exports.iterUsedKeys = function*(usedKeys, start, end = entryCount) {
  // Make sure we don't go beyond the available history.
  end = Math.min(end, entryCount);
  let index = Math.max(start, 0);
  while(index <= end) {
    const theKeys = usedKeys.get(index++);
    if (theKeys) yield* theKeys;
  }
}

class RelatableEntry {
  /**
   * @param {AnyRelationDef[]} relations 
   */
  constructor(relations) {
    const relsByType = chain(relations)
      .map((relDef) => {
        if (isRelationOfType(relDef, "allOf"))
          return tuple("allOf", relDef);
        if (isRelationOfType(relDef, "atLeastOne"))
          return tuple("atLeastOne", relDef);
        if (isRelationOfType(relDef, "immediate"))
          return tuple("immediate", relDef);
        if (isRelationOfType(relDef, "negated"))
          return tuple("negated", relDef);
        throw new Error(`Unknown relation type: ${relDef.type}`);
      })
      .thru((kvps) => partition(kvps))
      .value((kvps) => fromPairs(kvps));
    
    this.keysOfInterest = new Set(relations.map((relDef) => relDef.key));
    this.allOf = relsByType.allOf ?? [];
    this.atLeastOne = relsByType.atLeastOne ?? [];
    this.immediate = relsByType.immediate ?? [];
    this.negated = relsByType.negated ?? [];
  }

  /**
   * Checks if this relator is interested in any of the keys in the given `keySet`.
   * 
   * Unlike `check` and `checkKeys`, this is just checking to see if an entry is
   * interested in another entry, including its negated keys.
   * 
   * @param {Set<string>} keySet
   * @returns {boolean}
   */
  isInterestedIn(keySet) {
    for (const key of keySet)
      if (this.keysOfInterest.has(key)) return true;
    return false;
  }

  /**
   * Checks for matching keys in the given `UsedKeysMap` across the given range of history
   * sources.  Returns `false` if the match failed, but you can get a `0` if the relations
   * were all empty, which still generally counts as a successful match.
   * 
   * So, make sure you use `===` with `false` to check for complete failures.
   * 
   * @param {UsedKeysMap} usedKeysMap
   * A map of history sources to sets of entry keys.
   * @param {number} start
   * The history source to begin the search at.
   * @param {number} [end]
   * The history source to end the search at.
   * @returns {false | number}
   */
  check(usedKeysMap, start, end = entryCount) {
    if (!this.keysOfInterest.size) return 0;

    const usedKeys = new Set([...exports.iterUsedKeys(usedKeysMap, start, end)]);
    let matchCount = this.checkKeys(usedKeys);
    if (matchCount === false) return false;

    // Check immediate relations.
    // These relations only match the current history entry, which is assumed to be `start`.
    if (this.immediate.length > 0) {
      const immediateKeys = new Set([...exports.iterUsedKeys(usedKeysMap, start, start)]);
      if (immediateKeys.size === 0) return false;

      for (const relation of this.immediate)
        if (!immediateKeys.has(relation.key)) return false;
      matchCount += this.immediate.length;
    }

    if (matchCount === 0) return false;
    return matchCount;
  }

  /**
   * Checks for matching keys in the set of `usedKeys`.  Returns `false` if the match
   * failed, but you can get a `0` if the relations were all empty, which still generally
   * counts as a successful match.
   * 
   * So, make sure you use `===` with `false` to check for complete failures.
   * 
   * @param {Set<string>} usedKeys
   * The set of strings to match.
   * @param {boolean} [includeImmediate]
   * If `true`, it will also check immediate relations, disregarding where `usedKeys` was
   * sourced from.  In this case, immediate relations are treated the same as all-of relations.
   * @returns {false | number}
   */
  checkKeys(usedKeys, includeImmediate = false) {
    if (!this.keysOfInterest.size) return 0;
    if (usedKeys.size === 0) return false;

    // Check negated relations.
    for (const relation of this.negated)
      if (usedKeys.has(relation.key)) return false;
    
    let matchCount = 0;
    
    // Check at-least-one relations.
    if (this.atLeastOne.length > 0) {
      for (const relation of this.atLeastOne)
        if (usedKeys.has(relation.key)) matchCount += 1;
      if (matchCount === 0) return false;
    }

    // Check all-of relations.
    for (const relation of this.allOf)
      if (!usedKeys.has(relation.key)) return false;
    // Since they all had to match, just toss them in!
    matchCount += this.allOf.length;

    // Check immediate relations, if requested.
    if (includeImmediate && this.immediate.length > 0) {
      for (const relation of this.immediate)
        if (!usedKeys.has(relation.key)) return false;
      matchCount += this.immediate.length;
    }

    if (matchCount === 0) return false;
    return matchCount;
  }
}

exports.RelatableEntry = RelatableEntry;

/** An empty relatable entry, for initialization. */
exports.nilRelatableEntry = new RelatableEntry([]);