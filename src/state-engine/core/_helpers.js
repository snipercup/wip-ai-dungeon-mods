const { shutUpTS, dew, tuple2, tuple3 } = require("../../utils");
const { mapIter, iterArray, toPairs, fromPairs, chain } = require("../../utils");
const { entryCount } = require("../config");

/** @type {import("./types").GetAssociationSet} */
exports.getAssociationSet = dew(() => {
  /**
   * @param {import("./types").Context} ctx
   * @param {AssociationSources} source
   * @param {boolean} [create]
   * @returns {Maybe<Set<StateEngineEntry["infoId"]>>}
   */
  const impl = (ctx, source, create = false) => {
    let theSet = ctx.stateAssociations.get(source);
    if (theSet || !create) return theSet;
    theSet = new Set();
    ctx.stateAssociations.set(source, theSet);
    return theSet;
  };

  return shutUpTS(impl);
});

/**
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @param {UsedKeysMap} [usedKeys]
 * @returns {Iterable<[MatchableEntry, FlatAssociationParams]>}
 */
exports.associationsHelper = function* (data, usedKeys) {
  const ctx = data.stateEngineContext;
  const { playerMemory, state } = data;
  const { memory: { frontMemory }, $$setAuthorsNote } = state;
  // Let's get the easy stuff out of the way first.
  for (const matcher of ctx.sortedStateMatchers) {
    if (matcher.targetSources.has("implicit"))
      yield [matcher, { source: "implicit" }];
    if (playerMemory && matcher.targetSources.has("playerMemory"))
      yield [matcher, { source: "playerMemory", entry: playerMemory }];
    if (!$$setAuthorsNote && matcher.targetSources.has("authorsNote"))
      yield [matcher, { source: "authorsNote" }];
    if (!frontMemory && matcher.targetSources.has("frontMemory"))
      yield [matcher, { source: "frontMemory" }];
  }

  // Next, we'll run through the implicit inclusions and give a chance for entries
  // to add themselves in by being referenced within them.
  for (const matcher of ctx.sortedStateMatchers) {
    if (!matcher.targetSources.has("implicitRef")) continue;

    for (const includedId of exports.getAssociationSet(ctx, "implicit", true)) {
      if (matcher.infoId === includedId) continue;
      const otherEntry = ctx.entriesMap[includedId];
      yield [matcher, { source: "implicitRef", entry: otherEntry }];
    }
  }

  // Now we'll do the actual history texts.
  for (const [index, historyEntry] of iterArray(ctx.workingHistory)) {
    const offset = ctx.workingHistory.length - 1 - index;
    for (const matcher of ctx.sortedStateMatchers)
      if (matcher.targetSources.has("history"))
        yield [matcher, { source: offset, entry: historyEntry, usedKeys }];
  }
};

exports.makePreRuleIterators = dew(() => {
  const nilIter = () => [];

  /**
   * @param {import("./types").Context} ctx
   * @returns {(source: AssociationSources) => Iterable<PreRuleIteratorResult>}
   */
  const makeRuleIterator = (ctx) => function* (source) {
    const ids = exports.getAssociationSet(ctx, source);
    if (!ids) return;
    for (const id of ids) yield tuple2(ctx.entriesMap[id], source);
  };

  /**
   * @param {import("./types").Context} ctx
   * @param {StateEngineEntry} stateEntry
   * @param {AssociationSources} source
   * @returns {PreRuleIterators}
   */
  const impl = (ctx, stateEntry, source) => {
    const getFor = makeRuleIterator(ctx);

    const before = dew(() => {
      if (typeof source === "string") return nilIter;
      return function* () {
        for (let i = source + 1; i <= entryCount; i++)
          yield* getFor(i);
      };
    });
  
    const current = function* () {
      for (const otherEntry of getFor(source))
        if (otherEntry[0].infoId !== stateEntry.infoId)
          yield otherEntry;
    };
  
    const after = dew(() => {
      if (typeof source === "string") return nilIter;
      return function* () {
        for (let i = source - 1; i >= 0; i--)
          yield* getFor(i);
      };
    });

    return { getFor, before, current, after };
  };

  return impl;
});

/**
 * @param {PreRuleIterators} preRuleIter
 * @param {ScoresMap} scoresMap
 * @param {Array<[StateEngineEntry, AssociationSources]>} usedEntries
 * @returns {PostRuleIterators}
 */
exports.toPostRuleIterators = (preRuleIter, scoresMap, usedEntries) => {
  /** @type {any} */
  const postRuleIter = chain(toPairs(preRuleIter))
    .concat([tuple2("selected", () => usedEntries)])
    .map(([key, iteratorFn]) => {
      /**
       * @param  {[] | [AssociationSources]} args 
       * @returns {Iterable<PostRuleIteratorResult>}
       */
      const adapted = (...args) => {
        // @ts-ignore - More argument shenanigans that TS don't understand.
        const iterable = iteratorFn(...args);
        return mapIter(iterable, ([otherEntry, source]) => {
          const score = scoresMap.get(source)?.get(otherEntry.infoId) ?? 0;
          return tuple3(otherEntry, source, score);
        });
      };

      return tuple2(key, adapted);
    })
    .value((kvps) => fromPairs(kvps));

  return postRuleIter;
};