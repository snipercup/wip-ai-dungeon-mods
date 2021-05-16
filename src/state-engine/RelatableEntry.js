const { entryCount } = require("./config");
const { chain, partition, fromPairs, tuple } = require("../utils");
const { setsIntersect, setIsSubsetOf } = require("../utils");

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
    const theKeys = usedKeys.get(index);
    if (theKeys) yield* theKeys;
    index += 1;
  }
}

class RelatableEntry {
  /**
   * @param {readonly AnyRelationDef[]} relations 
   */
  constructor(relations) {
    const { isRelationOfType } = require("./StateEngineEntry");

    const relsByType = chain(relations)
      .map((relDef) => {
        if (isRelationOfType(relDef, "allOf"))
          return tuple("allOf", relDef.key);
        if (isRelationOfType(relDef, "atLeastOne"))
          return tuple("atLeastOne", relDef.key);
        if (isRelationOfType(relDef, "immediate"))
          return tuple("immediate", relDef.key);
        if (isRelationOfType(relDef, "negated"))
          return tuple("negated", relDef.key);
        throw new Error(`Unknown relation type: ${relDef.type}`);
      })
      .thru((kvps) => partition(kvps))
      .value((kvps) => fromPairs(kvps));

    this.allOf = new Set(relsByType.allOf ?? []);
    this.atLeastOne = new Set(relsByType.atLeastOne ?? []);
    this.immediate = new Set(relsByType.immediate ?? []);
    this.negated = new Set(relsByType.negated ?? []);

    this.keysOfInterest = new Set(relations.map((relDef) => relDef.key));
    this.keysForMatch = new Set([...this.allOf, ...this.atLeastOne, ...this.immediate]);
  }

  /**
   * Checks if this relator is interested in any of the keys in the given `keySet`.
   * 
   * Unlike `isMemberOf`, this checks to see if the relator recognizes any key for
   * any of its relations, including negated relations.  It is mostly useful for determining
   * if a `check` would be worth running in the first place.
   * 
   * @param {Set<string>} keySet
   * @returns {boolean}
   */
  isInterestedIn(keySet) {
    return setsIntersect(keySet, this.keysOfInterest);
  }

  /**
   * Checks if this relator has relations that could match a key in the given `keySet`.
   * 
   * Unlike `isInterestedIn`, this skips negated keys that could cause a `check` to fail.
   * Its most useful after a successful `check` for quickly determining membership between
   * different entries, IE: whether one entry recognizes another.
   * 
   * @param {Set<string>} keySet
   * @returns {boolean}
   */
  isMemberOf(keySet) {
    return setsIntersect(keySet, this.keysForMatch);
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
    // Short circuit if we have no relations.
    if (this.keysOfInterest.size === 0) return 0;

    const usedKeys = new Set(exports.iterUsedKeys(usedKeysMap, start, end));
    
    // Check negated relations.
    if (!this.checkNegated(usedKeys)) return false;
    
    // Check at-least-one relations.
    const atLeastOneCount = this.checkAtLeastOne(usedKeys);
    if (atLeastOneCount === false) return false;

    // Check all-of relations.
    const allOfCount = this.checkAllOf(usedKeys);
    if (allOfCount === false) return false;

    // Check immediate relations.
    // These relations only match the current history entry, which is assumed to be `start`.
    const immediateCount = this.checkImmediate(new Set(exports.iterUsedKeys(usedKeysMap, start, start)));
    if (immediateCount === false) return false;
    
    const matchCount = atLeastOneCount + allOfCount + immediateCount;
    return matchCount === 0 ? false : matchCount;
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
    if (this.keysOfInterest.size === 0) return 0;
    if (usedKeys.size === 0) return false;

    // Check negated relations.
    if (!this.checkNegated(usedKeys)) return false;
    
    // Check at-least-one relations.
    const atLeastOneCount = this.checkAtLeastOne(usedKeys);
    if (atLeastOneCount === false) return false;

    // Check all-of relations.
    const allOfCount = this.checkAllOf(usedKeys);
    if (allOfCount === false) return false;

    // Exit early if we're not interested in immediate relations.
    if (!includeImmediate) return atLeastOneCount + allOfCount;

    // Check immediate relations.
    const immediateCount = this.checkImmediate(usedKeys);
    if (immediateCount === false) return false;

    return atLeastOneCount + allOfCount + immediateCount;
  }

  /**
   * @param {Set<string>} usedKeys
   * @returns {boolean}
   */
  checkNegated(usedKeys) {
    if (this.negated.size === 0) return true;
    return !setsIntersect(usedKeys, this.negated);
  }

  /**
   * @param {Set<string>} usedKeys
   * @returns {number | false}
   */
  checkAtLeastOne(usedKeys) {
    if (this.atLeastOne.size === 0) return 0;
    if (usedKeys.size === 0) return false;

    let matchCount = 0;
    for (const relKey of this.atLeastOne)
      if (usedKeys.has(relKey)) matchCount += 1;
    return matchCount === 0 ? false : matchCount;
  }

  /**
   * @param {Set<string>} usedKeys
   * @returns {number | false}
   */
  checkAllOf(usedKeys) {
    if (this.allOf.size === 0) return 0;
    if (usedKeys.size === 0) return false;
    if (!setIsSubsetOf(this.allOf, usedKeys)) return false;
    return this.allOf.size;
  }

  /**
   * @param {Set<string>} usedKeys
   * @returns {number | false}
   */
  checkImmediate(usedKeys) {
    if (this.immediate.size === 0) return 0;
    if (usedKeys.size === 0) return false;
    if (!setIsSubsetOf(this.immediate, usedKeys)) return false;
    return this.immediate.size;
  }
}

exports.RelatableEntry = RelatableEntry;

/** An empty relatable entry, for initialization. */
exports.nilRelatableEntry = new RelatableEntry([]);