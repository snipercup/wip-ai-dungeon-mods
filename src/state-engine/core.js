/// <reference path="./state-engine.d.ts" />
const { dew, shutUpTS, tuple2, tuple3 } = require("../utils");
const { chain, iterArray, iterReverse, groupBy, mapValues, mapIter } = require("../utils");
const { escapeRegExp, toPairs, fromPairs, ident, getText } = require("../utils");
const { Roulette } = require("../utils/Roulette");
const { MatchableEntry, memoizedCounter } = require("./MatchableEntry");
const { StateEngineEntry } = require("./StateEngineEntry");
const turnCache = require("../turn-cache");

// Configuration.

/** The number of `history` entries to match to state data. */
const entryCount = 20;

// Private state.
/** @type {import("../turn-cache").WriteCache<StateDataCache>} */
let theCache;
/** @type {Record<string, StateEngineData>} */
let newDataMap = {};
/** @type {Record<string, StateEngineEntry>} */
let currentEntriesMap = {};
/** @type {Record<string, WorldInfoEntry>} */
let worldInfoMap = {};
/** @type {string[]} */
let validationIssues = [];
/** @type {MatchableEntry[]} */
let sortedStateMatchers = [];
/** @type {HistoryEntry[]} */
let workingHistory = [];
/** @type {StateAssociations} */
let stateAssociations = new Map();

/** @type {Record<string, StateDefinition>} */
const worldStateDefinitions = {};

/**
 * Sorts `StateEngineData`.  Data with relations to other data are sorted toward
 * the end, so they are evaluated last and will be able to look up if the related
 * data was matched.
 * 
 * @param {StateEngineData} a 
 * @param {StateEngineData} b 
 */
const stateSorter = (a, b) => {
  // When one references the other, sort the one doing the referencing later.
  // It is possible that they reference each other; this is undefined behavior.
  if (a.relations.includes(b.type)) return 1;
  if (b.relations.includes(a.type)) return -1;

  // When one has more references, sort that one later.
  const refCount = a.relations.length - b.relations.length;
  if (refCount !== 0) return refCount;

  // When one has a key and the other doesn't, sort the key'd one later.
  const aHasKey = Boolean(a.key);
  if (aHasKey !== Boolean(b.key)) return aHasKey ? 1 : -1;

  return 0;
};

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
const iterUsedKeys = function*(usedKeys, start, end = entryCount) {
  // Make sure we don't go beyond the available history.
  end = Math.min(end, entryCount);
  let index = Math.max(start, 0);
  while(index <= end) {
    const theKeys = usedKeys.get(index++);
    if (theKeys) yield* theKeys;
  }
}

/**
 * Checks the `text` against the keywords of the given `matcher`.
 * 
 * @param {MatchableEntry} matcher
 * @param {string} text
 */
const checkKeywords = (matcher, text) => {
  if (!text) return false;
  if (matcher.hasExcludedWords(text)) return false;
  if (!matcher.hasIncludedWords(text)) return false;
  return true;
};

/**
 * @template {keyof StateProcessors} TProc
 * @param {StateEngineData["type"]} stateType
 * @param {TProc} processor
 * @param {AssertStateProcessor<TProc>} defaultFn
 * @returns {AssertStateProcessor<TProc>}
 */
const getProcessorFor = (stateType, processor, defaultFn) => {
  const procFn = worldStateDefinitions[stateType]?.[processor];
  if (!procFn) return defaultFn;
  // @ts-ignore - Cannot be known, but checked.
  return (...args) => {
    // @ts-ignore - Cannot be known, but checked.
    const result = procFn(...args);
    if (result != null) return result;
    // @ts-ignore - Cannot be known, but checked.
    return defaultFn(...args);
  }
};

/** @type {GetAssociationSetFn} */
const getAssociationSet = dew(() => {
  /**
   * @param {AssociationSources} source
   * @param {boolean} [create]
   * @returns {Maybe<Set<StateEngineEntry["infoId"]>>}
   */
  const impl = (source, create = false) => {
    let theSet = stateAssociations.get(source);
    if (theSet || !create) return theSet;
    theSet = new Set();
    stateAssociations.set(source, theSet);
    return theSet;
  };

  return shutUpTS(impl);
})

const makePreRuleIterators = dew(() => {
  const nilIter = () => [];

  /** @returns {(source: AssociationSources) => Iterable<PreRuleIteratorResult>} */
  const makeRuleIterator = () => function* (source) {
    const ids = getAssociationSet(source);
    if (!ids) return;
    for (const id of ids)
      yield tuple2(currentEntriesMap[id], source);
  };

  /**
   * @param {StateEngineEntry} stateEntry
   * @param {AssociationSources} source
   * @returns {PreRuleIterators}
   */
  const fn = (stateEntry, source) => {
    const getFor = makeRuleIterator();

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

  return fn;
});

/**
 * Ensures local variables are reset (in case they don't reset between runs).
 * 
 * @type {BundledModifierFn}
 */
const init = (data) => {
  data.matchCounter = memoizedCounter();
  theCache = turnCache.forWrite(data, "StateEngine.association");
};

/**
 * Against `state.$$stateDataCache`, removes deleted `WorldInfoEntry` and parses
 * new `StateEngineData` for insertions or updates.
 * 
 * @type {BundledModifierFn}
 */
const updateStateEntries = ({ worldEntries, state }) => {
  worldInfoMap = fromPairs(worldEntries.map((wi) => tuple2(wi.id, wi)));
  newDataMap = {};
  validationIssues = [];

  // Determine what needs updating.
  const existingCache = state.$$stateDataCache || {};
  const missingIds = Object.keys(worldInfoMap).filter((id) => !existingCache[id]);
  const discardedIds = Object.keys(existingCache).filter((id) => !worldInfoMap[id]);
  const updateIds = Object.keys(existingCache)
    .filter((id) => Boolean(worldInfoMap[id]))
    .filter((id) => worldInfoMap[id].keys !== existingCache[id].infoKey);

  // Perform updates.
  for (const id of [...discardedIds, ...updateIds])
    delete existingCache[id];
  for (const id of [...missingIds, ...updateIds]) {
    const newEntry = StateEngineEntry.parse(worldInfoMap[id]);
    if (!newEntry) {
      validationIssues.push(`World info entry \`${worldInfoMap[id].keys}\` could not be parsed.`);
    }
    else if (newEntry.type !== "VanillaEntry" && newEntry.infoKey.indexOf(",") !== -1) {
      validationIssues.push([
        `World info entry \`${worldInfoMap[id].keys}\` contains a comma`,
        "keywords should be separated by a semi-colon, instead."
      ].join("; "));
    }
    else {
      newDataMap[id] = newEntry;
    }
  }

  // Update the cache for now; we may be initializing it for the first time.
  state.$$stateDataCache = existingCache;
};

/**
 * Validates newly parsed `StateEngineData`.  Will remove any that fail validation.
 * 
 * @type {BundledModifierFn}
 */
const validateStateEntries = (data) => {
  for (const id of Object.keys(newDataMap)) {
    const stateData = newDataMap[id];
    const validatorFn = getProcessorFor(stateData.type, "validator", () => []);
    const results = validatorFn(stateData);
    if (results.length === 0) continue;

    validationIssues.push(...results);
    delete newDataMap[id];
  }

  if (validationIssues.length === 0) return;
  data.useAI = false;
  data.message = [
    "The following State Engine validation issues were discovered:",
    ...validationIssues
  ].join("\n");
};

/**
 * Applies modifiers to newly parsed and validated `StateEngineData`.
 * 
 * @type {BundledModifierFn}
 */
const modifyStateEntries = (data) => {
  const allStates = Object.keys(newDataMap)
    .map((id) => newDataMap[id]);

  for (const id of Object.keys(newDataMap)) {
    const stateData = newDataMap[id];
    const modifierFn = getProcessorFor(stateData.type, "modifier", ident);
    newDataMap[id] = modifierFn(stateData, allStates);
  }
};

/**
 * Matches the type of input mode the player performed to submit the input.
 * This information is not currently provided by the API, and I like normalized data.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @returns {"do" | "say" | "story"}
 */
const parseInputMode = (data) => {
  const { info: { characters }, text } = data;
  const allCharacters = characters
    .map((pi) => pi.name?.trim())
    .filter(Boolean)
    .map((name) => escapeRegExp(name));
  const charMatch = ["you", ...allCharacters].join("|");

  // Check for `say` first, since it is more ambiguous than `do`.
  if (new RegExp(`^\\>\\s+(?:${charMatch}) says?`, "i").test(text)) return "say";
  if (new RegExp(`^\\>\\s+(?:${charMatch})`, "i").test(text)) return "do";
  return "story";
};

/**
 * Finalizes the internal state before processing.
 * 
 * @type {BundledModifierFn}
 */
const finalizeForProccessing = (data) => {
  const { text, state, history, matchCounter } = data;
  const { $$stateDataCache = {} } = state;
  const newCache = { ...$$stateDataCache, ...newDataMap };

  currentEntriesMap = mapValues(newCache, (sd, id) => new StateEngineEntry(sd, worldInfoMap[id]));
  stateAssociations = new Map();
  workingHistory = [...history.slice(-1 * entryCount), { text, type: parseInputMode(data) }];

  sortedStateMatchers = Object.keys(currentEntriesMap)
    .map((id) => currentEntriesMap[id])
    .sort(stateSorter)
    .map((sd) => new MatchableEntry(sd, worldInfoMap[sd.infoId], matchCounter));
  
  state.$$stateDataCache = newCache;
};

/**
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @returns {Iterable<AssociationHelperResult>}
 */
const associationsHelper = function* (data) {
  const { playerMemory, state: { memory: { authorsNote, frontMemory } } } = data;
  // Let's get the easy stuff out of the way first.
  for (const matcher of sortedStateMatchers) {
    yield [matcher, "implicit"];
    if (playerMemory) yield [matcher, "playerMemory", playerMemory];
    if (!authorsNote) yield [matcher, "authorsNote"];
    if (!frontMemory) yield [matcher, "frontMemory"];
  }

  // Next, we'll run through the implicit inclusions and give a chance for entries
  // to add themselves in by being referenced within them.
  for (const matcher of sortedStateMatchers) {
    for (const includedId of getAssociationSet("implicit", true)) {
      if (matcher.infoId === includedId) continue;
      const stateData = currentEntriesMap[includedId];
      yield [matcher, "implicitRef", stateData];
    }
  }

  // Now we'll do the actual history texts.
  for (const [index, historyEntry] of iterArray(workingHistory)) {
    const offset = workingHistory.length - 1 - index;
    for (const matcher of sortedStateMatchers)
      yield [matcher, offset, historyEntry];
  }
};

/**
 * @param {MatchableEntry} matcher
 * @param {AssociationSources} source
 * @param {StateEngineEntry | HistoryEntry | string} [entry]
 * @param {UsedKeysMap} [usedKeys]
 * @returns {boolean}
 */
const defaultAssociationFn = (matcher, source, entry, usedKeys) => {
  // The default associator only works with known entry types.
  if (worldStateDefinitions[matcher.type] == null) return false;

  const text = getText(entry).trim();
  
  // The default associator requires text to do any form of matching.
  if (!text) return false;
  // Default associator does not do implicit reference associations.
  if (source === "implicitRef") return false;
  if (!checkKeywords(matcher, text)) return false; 

  // We're done if we can't process relations.
  if (!usedKeys) return true;

  // The default associator looks at the entire history up to this point
  // for matching references.
  const validForRelations = dew(() => {
    if (matcher.stateEntry.relations.length === 0) return true;
    if (typeof source !== "number") return true;
    const allUsedKeys = new Set(iterUsedKeys(usedKeys, source));
    return matcher.stateEntry.relations.every((key) => allUsedKeys.has(key));
  });
  if (!validForRelations) return false;

  // Record this key's usage, if needed.
  if (!matcher.stateEntry.key) return true;
  if (typeof source !== "number") return true;

  const theKeys = usedKeys.get(source) ?? new Set();
  theKeys.add(matcher.stateEntry.key);
  usedKeys.set(source, theKeys);
  return true;
};

/**
 * Goes through the available texts, determining which `StateEngineEntry` objects
 * match with what text.
 * 
 * @type {BundledModifierFn}
 */
const associateState = (data) => {
  /** @type {UsedKeysMap} */
  const usedKeys = new Map();

  for (const [matcher, source, entry] of associationsHelper(data)) {
    /** @type {StateAssociationBaseFn} */
    const associationFn = getProcessorFor(matcher.type, "associator", defaultAssociationFn);
    const result
      = typeof source === "string" ? associationFn(matcher, source, entry)
      : associationFn(matcher, source, entry, usedKeys);
    if (result) getAssociationSet(source, true).add(matcher.infoId);
  }

  //console.log([...usedKeys].map(([key, theSet]) => `${key} uses: ${[...theSet].join(", ")}`));
};

const defaultPreRule = () => true;

/**
 * Refines the state associations, applying the pre-rule for each type of state
 * data to allow them to fit specific purposes.
 * 
 * @type {BundledModifierFn}
 */
const applyPreRules = (data) => {
  for (const args of associationsHelper(data)) {
    const [matcher, source] = args;
    const theSet = getAssociationSet(source);
    if (!theSet) continue;
    if (!theSet.has(matcher.infoId)) continue;

    const preRuleFn = getProcessorFor(matcher.type, "preRules", defaultPreRule);
    const neighbors = makePreRuleIterators(matcher.stateEntry, source);
    const result = preRuleFn(matcher, source, neighbors);
    if (!result) theSet.delete(matcher.infoId);
  }
};

/** @type {StateValuatorFn} */
const defaultValuator = () => 1;

/** @type {StatePostRuleFn} */
const defaultPostRule = () => true;

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
 * @param {PreRuleIterators} preRuleIter
 * @param {ScoresMap} scoresMap
 * @param {Array<[StateEngineEntry, AssociationSources]>} usedEntries
 * @returns {PostRuleIterators}
 */
const toPostRuleIterators = (preRuleIter, scoresMap, usedEntries) => {
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

/**
 * Sorts entries in `StateDataCache.forContextMemory`.
 * 
 * @param {StateEngineCacheData} a 
 * @param {StateEngineCacheData} b 
 */
const contextMemorySorter = (a, b) => {
  // Sort by priority, higher coming first.
  if (a.priority != null && b.priority != null)
    return a.priority - b.priority;

  const aEntry = currentEntriesMap[a.infoId];
  const bEntry = currentEntriesMap[b.infoId];

  const aRefs = bEntry.key ? aEntry.relations.includes(bEntry.key) : false;
  const bRefs = aEntry.key ? bEntry.relations.includes(aEntry.key) : false;
  // If they reference each other, place the one with more relations later.
  if (aRefs && bRefs) return bEntry.relations.length - aEntry.relations.length;
  // If one references the other, place the referencing entry afterward.
  if (aRefs) return 1;
  if (bRefs) return -1;
  return 0;
};

/**
 * Runs the state valuators and picks a single entry per assocaition source,
 * except the `implicit` source, which may have more than one.
 * 
 * @type {BundledModifierFn}
 */
const superHappyRouletteTime = (data) => {
  const winnersArr = chain(associationsHelper(data))
    .filter(([matcher, source]) => {
      const theSet = getAssociationSet(source);
      if (!theSet) return false;
      return theSet.has(matcher.infoId);
    })
    // Group everything by their sources, because I'm lazy.
    .thru((assoc) => groupBy(assoc, ([, source]) => source))
    // First, assign weights to all the entries in this group using the valuator,
    // and then add them to the roulette wheel.
    .map(([source, group]) => {
      /** @type {Roulette<MatchableEntry>} */
      const roulette = new Roulette();

      for (const args of group) {
        const [matcher, source, entry] = args;
        const valuatorFn = getProcessorFor(matcher.type, "valuator", defaultValuator);
        const weight = dew(() => {
          let value = valuatorFn(matcher, source, entry);
          // Short-circuit: entry can't win.
          if (value == null) return 0;

          if (!Array.isArray(value)) {
            // Short-circuit: entry can't win.
            if (value <= 0) return 0;

            // We need to create a valuation array for this entry.
            const text = entry && getText(entry);
            const keywordsCount = matcher.stateEntry.include.length;
            const uniqueKeywordsMatched = text ? matcher.uniqueOccurancesIn(text) : 0;

            const keywordPart = uniqueKeywordsMatched === 0 ? 0.5 : uniqueKeywordsMatched / keywordsCount;
            const relationsPart = matcher.stateEntry.relations.length + 1;
            value = [value, keywordPart * 10, relationsPart];
          }

          const finalScore = value.reduce((prev, cur) => prev * cur, 1);
          // Limit to range between 0 and 1000.
          return Math.max(0, Math.min(1000, finalScore));
        });
        
        if (weight === 0) continue;
        roulette.push(weight, matcher);
      }

      return tuple2(source, roulette);
    })
    // Now, we want to create a list of winners, with their weights.
    .map(([source, roulette]) => tuple2(source, [...spinToWin(roulette)]))
    // Materialize the result.
    .toArray();
  
  /** @type {ScoresMap} */
  const scoresMap = chain(winnersArr)
    .map(([source, kvps]) => {
      const sourceMap = new Map(kvps.map(([matcher, score]) => tuple2(matcher.infoId, score)));
      return tuple2(source, sourceMap);
    })
    .value((result) => new Map(result));

  // Now we begin picking winners.  We apply the post rules as we go, in case
  // it tells us to remove the current entry, another entry may be selected
  // in its stead.  That's why we did `[...spinToWin(roulette)]` earlier.
  // We pre-drew the winners, so we had fallbacks.
  /** @type {Set<StateEngineEntry["infoId"]>} */
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
        const { type, stateEntry, infoId } = matcher;
        if (usedEntryIds.has(infoId)) continue;
        if (usedTypes.has(type)) continue;

        const postRuleFn = getProcessorFor(type, "postRules", defaultPostRule);
        const preIters = makePreRuleIterators(stateEntry, source);
        const neighbors = toPostRuleIterators(preIters, scoresMap, usedEntries);
        const result = postRuleFn(matcher, source, score, neighbors);
        if (!result) continue;

        usedEntryIds.add(infoId);
        usedEntries.push([matcher.stateEntry, source]);
        usedTypes.add(type);
        winnerArr.push(infoId);
      }

      theWinners.set(source, new Set(winnerArr));
    }
    else {
      for (const [matcher, score] of theContestants) {
        const { type, stateEntry, infoId } = matcher;
        if (usedEntryIds.has(infoId)) continue;

        const postRuleFn = getProcessorFor(type, "postRules", defaultPostRule);
        const preIters = makePreRuleIterators(stateEntry, source);
        const neighbors = toPostRuleIterators(preIters, scoresMap, usedEntries);
        const result = postRuleFn(matcher, source, score, neighbors);
        if (!result) continue;

        usedEntryIds.add(infoId);
        usedEntries.push([matcher.stateEntry, source]);
        theWinners.set(source, new Set([infoId]));
        break;
      }
    }
  }

  // Finally, we must say goodbye to the unlucky ones...
  stateAssociations = theWinners;

  // And now, we construct the object for the turn cache.
  /** @type {StateDataCache} */
  const newCacheData = {
    forContextMemory: [],
    forFrontMemory: null,
    forAuthorsNote: null,
    forHistory: {}
  };
  for (const [source, theSet] of stateAssociations) {
    for (const id of theSet) {
      const entry = currentEntriesMap[id];
      const score = scoresMap.get(source)?.get(id) ?? 0;
      const priority = worldStateDefinitions[entry.type].priority ?? null;
      const entryData = { infoId: id, score, priority, source };
      switch (source) {
        case "implicit":
        case "implicitRef":
        case "playerMemory":
          newCacheData.forContextMemory.push(entryData);
          break;
        case "frontMemory":
          newCacheData.forFrontMemory = entryData;
          break;
        case "authorsNote":
          newCacheData.forAuthorsNote = entryData;
          break;
        default:
          newCacheData.forHistory[source] = entryData;
          break;
      }
    }
  }

  // Sort the context memory entries.
  newCacheData.forContextMemory.sort(contextMemorySorter);

  // Put it where it belongs, and we're done.
  theCache.storage = newCacheData;
  theCache.commit();
};

const produceContextMemory = dew(() => {
  const { foldLines } = require("../utils");

  /**
   * @param {StateEngineEntry["infoId"]} id 
   * @returns {string}
   */
  const getEntryText = (id) => getText(currentEntriesMap[id]);

  /**
   * @param {string} playerMemory
   * @param {StateDataCache} cacheData
   * @returns {{ heading: string[], filler: string[], priority: string[] }}
   */
  const getMemoryParts = (playerMemory, cacheData) => {
    // Start with the stuff meant for the context memory.
    const heading = [
      // Trim out the new summary, if present.
      ...getText(playerMemory).split("\n").map((s) => s.trim()).filter((s) => !s.startsWith("#")),
      // Dump the context memory entries in there.
      ...cacheData.forContextMemory.map(({ infoId }) => getEntryText(infoId))
    ];
    
    // Throw all the history stuff into a roulette again.
    /** @type {Roulette<string>} */
    const roulette = new Roulette();
    for (const [, data] of toPairs(cacheData.forHistory)) {
      const text = getEntryText(data.infoId);
      if (!text) continue;
      roulette.push(data.score, text);
    }
    
    // Convert to an array; the highest scoring will generally come first.
    const entryTexts = [...mapIter(spinToWin(roulette), ([text]) => text)];

    // The first two will be treated as priority inserts.
    const priority = entryTexts.slice(0, 2);
    // The rest will be filler texts.
    const filler = entryTexts.slice(2);

    return { heading, filler, priority };
  };

  /**
   * @param {string} playerMemory
   * @param {StateDataCache} cacheData
   * @returns {string}
   */
  const produceContextMemory = (playerMemory, cacheData) => {
    const { heading, filler, priority } = getMemoryParts(playerMemory, cacheData);
    return foldLines(1000, heading, filler, priority)
      .map((text) => text.trim())
      .filter(Boolean)
      .join("\n");
  };

  return produceContextMemory;
});

/**
 * Applies the roulette one more time, removing entries until they can fit into
 * the available context memory.  All the data we selected is in the turn cache
 * for later; this step is just to help with the edit distance restrictions and
 * make this functional without any other supporting plugins.
 * 
 * @type {BundledModifierFn}
 */
const loadUpMemory = ({ state: { memory }, playerMemory }) => {
  const cacheData = theCache.storage;
  if (!cacheData) return;

  const newContextMem = produceContextMemory(playerMemory, cacheData);
  if (newContextMem) memory.context = newContextMem;
  
  // Only set these if it is not already set by something else.
  if (cacheData.forAuthorsNote && !memory.authorsNote) {
    const entry = currentEntriesMap[cacheData.forAuthorsNote.infoId];
    const newAuthorsNote = getText(entry).trim();
    if (newAuthorsNote) memory.authorsNote = newAuthorsNote;
  }
  
  if (cacheData.forFrontMemory && !memory.frontMemory) {
    const entry = currentEntriesMap[cacheData.forFrontMemory.infoId];
    const newFrontMemory = getText(entry).trim();
    if (newFrontMemory) memory.frontMemory = newFrontMemory;
  }
};

/**
 * 
 * @param {StateEngineData["type"]} stateType 
 * @param {StateDefinition} processors 
 */
const addStateEntry = (stateType, processors) => {
  worldStateDefinitions[stateType] = processors;
};

module.exports.stateModule = {
  pre: [init],
  exec: [
    // Setting up the state entries.
    updateStateEntries, validateStateEntries, modifyStateEntries, finalizeForProccessing,
    // Crunching the data.
    associateState, applyPreRules, superHappyRouletteTime
  ],
  post: [loadUpMemory]
};

module.exports.addStateEntry = addStateEntry;
module.exports.checkKeywords = checkKeywords;
module.exports.iterUsedKeys = iterUsedKeys;
module.exports.worldStateDefinitions = worldStateDefinitions;