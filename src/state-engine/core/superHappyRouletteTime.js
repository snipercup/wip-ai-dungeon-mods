const { tuple2, groupBy, iterReverse, chain } = require("../../utils");
const { Roulette } = require("../../utils/Roulette");
const { associationsHelper, getAssociationSet } = require("./_helpers");
const { makePreRuleIterators, toPostRuleIterators } = require("./_helpers");

/**
 * @template T
 * @param {Roulette<T>} roulette
 * @returns {Iterable<[T, number]>}
 */
const spinToWin = function* (roulette) {
  let theWinner;
  while ((theWinner = roulette.pickAndPop()) != null) {
    yield theWinner;
  }
};

/**
 * Runs the state valuators and picks a single entry per assocaition source,
 * except the `implicit` source, which may have more than one.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  const winnersArr = chain(associationsHelper(data))
    .filter(([matcher, { source }]) => {
      const theSet = getAssociationSet(ctx, source);
      if (!theSet) return false;
      return theSet.has(matcher.entryId);
    })
    // Group everything by their sources, because I'm lazy.
    .thru((assoc) => groupBy(assoc, ([, { source }]) => source))
    // First, assign weights to all the entries in this group using the valuator,
    // and then add them to the roulette wheel.
    .map(([source, group]) => {
      /** @type {Roulette<MatchableEntry>} */
      const roulette = new Roulette();

      for (const [matcher, { source, entry }] of group) {
        let score = matcher.stateEntry.valuator(matcher, source, entry);
        score = Math.max(0, Math.min(1000, score));
        if (score === 0) continue;
        roulette.push(score, matcher);
      }

      return tuple2(source, roulette);
    })
    // Now, we want to create a list of winners, with their weights.
    .map(([source, roulette]) => tuple2(source, [...spinToWin(roulette)]))
    // Materialize the result.
    .toArray();

  ctx.scoresMap = chain(winnersArr)
    .map(([source, kvps]) => {
      const sourceMap = new Map(kvps.map(([matcher, score]) => tuple2(matcher.entryId, score)));
      return tuple2(source, sourceMap);
    })
    .value((result) => new Map(result));

  // Now we begin picking winners.  We apply the post rules as we go, in case
  // it tells us to remove the current entry, another entry may be selected
  // in its stead.  That's why we did `[...spinToWin(roulette)]` earlier.
  // We pre-drew the winners, so we had fallbacks.
  /** @type {Set<StateEngineEntry["entryId"]>} */
  const usedEntryIds = new Set();
  /** @type {Array<[StateEngineEntry, AssociationSources]>} */
  const usedEntries = [];
  /** @type {StateAssociations} */
  const theWinners = new Map();

  for (const [source, theContestants] of iterReverse(winnersArr)) {
    // Implicits are treated a little bit different.  It can have multiple
    // entries, but only one entry per type.
    if (source === "implicit") {
      /** @type {Set<StateEngineEntry["type"]>} */
      const usedTypes = new Set();
      const winnerArr = [];

      for (const [matcher, score] of theContestants) {
        const { type, stateEntry, entryId } = matcher;
        if (usedEntryIds.has(entryId)) continue;
        if (usedTypes.has(type)) continue;

        const preIters = makePreRuleIterators(ctx, stateEntry, source);
        const neighbors = toPostRuleIterators(preIters, ctx.scoresMap, usedEntries);
        const result = matcher.stateEntry.postRules(matcher, source, score, neighbors);
        if (!result) continue;

        usedEntryIds.add(entryId);
        usedEntries.push([matcher.stateEntry, source]);
        usedTypes.add(type);
        winnerArr.push(entryId);
      }

      theWinners.set(source, new Set(winnerArr));
    }
    else {
      for (const [matcher, score] of theContestants) {
        const { stateEntry, entryId } = matcher;
        if (usedEntryIds.has(entryId)) continue;

        const preIters = makePreRuleIterators(ctx, stateEntry, source);
        const neighbors = toPostRuleIterators(preIters, ctx.scoresMap, usedEntries);
        const result = matcher.stateEntry.postRules(matcher, source, score, neighbors);
        if (!result) continue;

        usedEntryIds.add(entryId);
        usedEntries.push([matcher.stateEntry, source]);
        theWinners.set(source, new Set([entryId]));
        break;
      }
    }
  }

  // Finally, we must say goodbye to the unlucky ones...
  ctx.stateAssociations = theWinners;
};