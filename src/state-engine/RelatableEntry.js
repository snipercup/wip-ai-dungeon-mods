const { chain, partition, fromPairs, tuple } = require("../utils");
const { isRelationOfType } = require("./StateEngineEntry");

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
        if (isRelationOfType(relDef, "negated"))
          return tuple("negated", relDef);
        throw new Error(`Unknown relation type: ${relDef.type}`);
      })
      .thru((kvps) => partition(kvps))
      .value((kvps) => fromPairs(kvps));
    
    this.keysOfInterest = new Set(relations.map((relDef) => relDef.key));
    this.allOf = relsByType.allOf ?? [];
    this.atLeastOne = relsByType.atLeastOne ?? [];
    this.negated = relsByType.negated ?? [];
  }

  /**
   * Checks if this relator is interested in any of the keys in the given `keySet`.
   * 
   * Unlike `check`, this is just checking to see if an entry is interested in another.
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
   * Checks for matching keys in the set of `usedKeys`.  Returns `false` if the match
   * failed, but you can get a `0` if the relations were all empty, which still generally
   * counts as a successful match.
   * 
   * So, make sure you use `===` with `false` to check for complete failures.
   * 
   * @param {Set<string>} usedKeys
   * @returns {false | number}
   */
  check(usedKeys) {
    if (!this.keysOfInterest.size) return 0;

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

    if (matchCount === 0) return false;
    return matchCount;
  }
}

exports.RelatableEntry = RelatableEntry;

/** An empty relatable entry, for initialization. */
exports.nilRelatableEntry = new RelatableEntry([]);