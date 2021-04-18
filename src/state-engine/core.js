/// <reference path="./state-engine.d.ts" />
const { dew, shutUpTS, tuple2, tuple3 } = require("../utils");
const { chain, iterArray, iterReverse, groupBy, mapIter } = require("../utils");
const { escapeRegExp, toPairs, fromPairs, getText } = require("../utils");
const { worldInfoString } = require("./utils");
const { Roulette } = require("../utils/Roulette");
const { entryCount } = require("./config");
const { MatchableEntry, memoizedCounter } = require("./MatchableEntry");
const { StateEngineEntry, BadStateEntryError, extractType } = require("./StateEngineEntry");
const turnCache = require("../turn-cache");

// Private state.
/** @type {import("../turn-cache").WriteCache<StateDataCache>} */
let theCache;
/** @type {Record<string, StateEngineEntry>} */
let newEntriesMap = {};
/** @type {Record<string, StateEngineEntry>} */
let currentEntriesMap = {};
/** @type {Record<string, WorldInfoEntry>} */
let worldInfoMap = {};
/** @type {Map<string, string[]>} */
let validationIssues = new Map();
/** @type {MatchableEntry[]} */
let sortedStateMatchers = [];
/** @type {HistoryEntry[]} */
let workingHistory = [];
/** @type {StateAssociations} */
let stateAssociations = new Map();
/** @type {ScoresMap} */
let scoresMap = new Map();

/** @type {Record<string, typeof StateEngineEntry>} */
const worldStateDefinitions = {};

/**
 * Sorts `StateEngineData`.  Data with relations to other data are sorted toward
 * the end, so they are evaluated last and will be able to look up if the related
 * data was matched.
 * 
 * @param {StateEngineEntry} a 
 * @param {StateEngineEntry} b 
 */
const stateSorter = (a, b) => {
  // When one has a key and the other doesn't, sort the key'd one later.
  const aHasKey = Boolean(a.key);
  if (aHasKey !== Boolean(b.key)) return aHasKey ? 1 : -1;

  // When one has more references, sort that one later.
  const refCount = a.relations.size - b.relations.size;
  if (refCount !== 0) return refCount;

  // When one references the other, sort the one doing the referencing later.
  // It is possible that they reference each other; this is undefined behavior.
  if (b.key && a.relations.has(b.key)) return 1;
  if (a.key && b.relations.has(a.key)) return -1;

  return 0;
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
 * Parses World Info entries into State Engine entries.
 * 
 * @type {BundledModifierFn}
 */
const createStateEntries = (data) => {
  const { worldEntries, state } = data;
  worldInfoMap = fromPairs(worldEntries.map((wi) => tuple2(wi.id, wi)));
  currentEntriesMap = {};
  validationIssues = new Map();

  /** @type {(id: string) => string | undefined} */
  const createEntry = (id) => {
    try {
      const worldInfo = worldInfoMap[id];
      const entryType = extractType(worldInfo) ?? "VanillaEntry";
      const EntryClass = worldStateDefinitions[entryType];
      if (!EntryClass) return `Unknown entry type: \`${entryType}\``;

      const newEntry = new EntryClass(worldInfo);
      if (!newEntry)
        return `World info could not be parsed.`;
        currentEntriesMap[id] = newEntry;
    }
    catch (err) {
      if (err instanceof BadStateEntryError) return err.message;
      throw err;
    }
  };
  
  // Perform entry construction.
  for (const id of Object.keys(worldInfoMap)) {
    const maybeIssue = createEntry(id);
    if (!maybeIssue) continue;
    const theIssues = validationIssues.get(id) ?? [];
    theIssues.push(maybeIssue);
    validationIssues.set(id, theIssues);
  }
};

/**
 * Validates newly parsed `StateEngineData`.  Will remove any that fail validation.
 * 
 * @type {BundledModifierFn}
 */
const validateStateEntries = (data) => {
  for (const id of Object.keys(currentEntriesMap)) {
    const entry = currentEntriesMap[id];
    const results = entry.validator();
    if (results.length === 0) continue;
    delete currentEntriesMap[id];

    const theIssues = validationIssues.get(id) ?? [];
    theIssues.push(...results);
    validationIssues.set(id, theIssues);
  }

  if (validationIssues.size === 0) return;

  data.useAI = false;
  data.message = chain(validationIssues)
    .map(([id, issues]) => [
      `\t${worldInfoString(worldInfoMap[id])}`,
      ...issues.map((issue) => (`\t\t• ${issue}`))
    ])
    .flatten()
    .value((lines) => {
      return [
        "The following State Engine validation issues were discovered:",
        ...lines
      ].join("\n")
    });
};

/**
 * @param {StateEngineEntry} entry
 * @returns {StateDataForModifier}
 */
const entryForModifier = (entry) => ({
  ...entry.toJSON(),
  // Clone the current state of the sets.
  relations: new Set(entry.relations),
  include: new Set(entry.include),
  exclude: new Set(entry.exclude)
});

/**
 * Applies modifiers to newly parsed and validated `StateEngineData`.
 * 
 * @type {BundledModifierFn}
 */
// @ts-ignore
const modifyStateEntries = (data) => {
  const currentEntries = Object.values(currentEntriesMap);

  // We need to store copies, as `modifier` will mutate instances.
  const allStates = chain(toPairs(currentEntriesMap))
    .map(([id, entry]) => tuple2(id, entryForModifier(entry)))
    .value((kvps) => new Map(kvps));

  for (const entry of currentEntries) entry.modifier(allStates);
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

  stateAssociations = new Map();
  workingHistory = [...history.slice(-1 * entryCount), { text, type: parseInputMode(data) }];

  sortedStateMatchers = Object.keys(currentEntriesMap)
    .map((id) => currentEntriesMap[id])
    .sort(stateSorter)
    .map((sd) => sd.toMatchable(matchCounter));
};

/**
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @param {UsedKeysMap} [usedKeys]
 * @returns {Iterable<[MatchableEntry, FlatAssociationParams]>}
 */
const associationsHelper = function* (data, usedKeys) {
  const { playerMemory, state: { memory: { authorsNote, frontMemory } } } = data;
  // Let's get the easy stuff out of the way first.
  for (const matcher of sortedStateMatchers) {
    yield [matcher, { source: "implicit" }];
    if (playerMemory) yield [matcher, { source: "playerMemory", entry: playerMemory }];
    if (!authorsNote) yield [matcher, { source: "authorsNote" }];
    if (!frontMemory) yield [matcher, { source: "frontMemory" }];
  }

  // Next, we'll run through the implicit inclusions and give a chance for entries
  // to add themselves in by being referenced within them.
  for (const matcher of sortedStateMatchers) {
    for (const includedId of getAssociationSet("implicit", true)) {
      if (matcher.infoId === includedId) continue;
      const otherEntry = currentEntriesMap[includedId];
      yield [matcher, { source: "implicitRef", entry: otherEntry }];
    }
  }

  // Now we'll do the actual history texts.
  for (const [index, historyEntry] of iterArray(workingHistory)) {
    const offset = workingHistory.length - 1 - index;
    for (const matcher of sortedStateMatchers)
      yield [matcher, { source: offset, entry: historyEntry, usedKeys }];
  }
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

  for (const [matcher, params] of associationsHelper(data, usedKeys)) {
    const result = matcher.stateEntry.associator(matcher, params);
    if (result) getAssociationSet(params.source, true).add(matcher.infoId);
  }

  //console.log([...usedKeys].map(([key, theSet]) => `${key} uses: ${[...theSet].join(", ")}`));
};

/**
 * Refines the state associations, applying the pre-rule for each type of state
 * data to allow them to fit specific purposes.
 * 
 * @type {BundledModifierFn}
 */
const applyPreRules = (data) => {
  for (const [matcher, { source }] of associationsHelper(data)) {
    const theSet = getAssociationSet(source);
    if (!theSet?.has(matcher.infoId)) continue;

    const neighbors = makePreRuleIterators(matcher.stateEntry, source);
    const result = matcher.stateEntry.preRules(matcher, source, neighbors);
    if (!result) theSet.delete(matcher.infoId);
  }
};

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
 * Runs the state valuators and picks a single entry per assocaition source,
 * except the `implicit` source, which may have more than one.
 * 
 * @type {BundledModifierFn}
 */
const superHappyRouletteTime = (data) => {
  const winnersArr = chain(associationsHelper(data))
    .filter(([matcher, { source }]) => {
      const theSet = getAssociationSet(source);
      if (!theSet) return false;
      return theSet.has(matcher.infoId);
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

  scoresMap = chain(winnersArr)
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

        const preIters = makePreRuleIterators(stateEntry, source);
        const neighbors = toPostRuleIterators(preIters, scoresMap, usedEntries);
        const result = matcher.stateEntry.postRules(matcher, source, score, neighbors);
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
        const { stateEntry, infoId } = matcher;
        if (usedEntryIds.has(infoId)) continue;

        const preIters = makePreRuleIterators(stateEntry, source);
        const neighbors = toPostRuleIterators(preIters, scoresMap, usedEntries);
        const result = matcher.stateEntry.postRules(matcher, source, score, neighbors);
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
};

/**
 * Dumps everything into the game-state caches.
 * 
 * @type {BundledModifierFn}
 */
const updateCaches = ({ state }) => {
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
      const priority = entry.priority ?? null;
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
  newCacheData.forContextMemory = chain(newCacheData.forContextMemory)
    .thru(require("./entrySorting").entrySorter)
    .map(({ order, ...data }) => data)
    .toArray();

  // Put it where it belongs.
  theCache.storage = newCacheData;
  theCache.commit();

  // Finally, update the parsed entry cache and we're done!
  state.$$stateDataCache = chain(toPairs(currentEntriesMap))
    .map(([k, entry]) => [k, entry.toJSON()])
    .value((kvps) => fromPairs(kvps));
};

const produceContextMemory = dew(() => {
  const { entrySorter } = require("./entrySorting");
  const { entrySelector } = require("./entrySelection");

  /**
   * @param {StateEngineEntry["infoId"]} id 
   * @returns {string}
   */
  const getEntryText = (id) => getText(currentEntriesMap[id]);

  /**
   * Yields lines from the player memory, ignoring lines starting with a `#` symbol.
   * Currently, they just jam the summary into the player-defined memory with a comment
   * warning you not to screw things up.
   * 
   * @param {string} playerMemory
   * @returns {Iterable<SortableEntry & { text: string }>}
   */
  const convertPlayerMemory = function* (playerMemory) {
    const lines = getText(playerMemory).split("\n");
    for (let i = 0, lim = lines.length; i < lim; i++) {
      const text = lines[i].trim();
      if (text.startsWith("#")) continue;
      yield { text, priority: (i + 1000) * -1, score: 100 };
    }
  };

  /**
   * @param {string} playerMemory
   * The player memory.  May contain the summary portion if With-Memory is not running.
   * @param {string | undefined} summary
   * If With-Memory is running, the extracted summary.
   * @param {StateDataCache} cacheData
   * The current-turn State Engine cache data.
   * @returns {string}
   */
  const produceContextMemory = (playerMemory, summary, cacheData) => {
    const forContext = cacheData?.forContextMemory ?? [];
    const forHistory = cacheData?.forHistory ? Object.values(cacheData.forHistory) : [];
    const resolvedSummary = summary ?? "";

    return chain()
      .concat(forContext, forHistory)
      .map((entry) => ({ ...entry, text: getEntryText(entry.infoId)}))
      .concat(convertPlayerMemory(playerMemory))
      .thru(entrySorter)
      .thru((notes) => entrySelector(notes, 1001 - resolvedSummary.length, {
        lengthGetter: ({ text }) => text.length + 1
      }))
      .map((note) => note.text.trim())
      .concat(resolvedSummary)
      .filter(Boolean)
      .toArray()
      .join("\n");
  };

  return produceContextMemory;
});

/**
 * Uses the natural sorting utiltiies to select entries for display in the memory.
 * Also inserts the Author's Note and Front Memory.
 * 
 * All the data we selected is in the turn cache for later; this step is just to
 * help with the edit distance restrictions and make this functional without any
 * other supporting plugins.
 * 
 * @type {BundledModifierFn}
 */
const loadUpMemory = ({ state: { memory }, playerMemory, summary }) => {
  const cacheData = theCache.storage;
  if (!cacheData) return;

  const newContextMem = produceContextMemory(playerMemory, summary, cacheData);
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
 * Registers a `StateEnginEntry` class.
 * 
 * @param {typeof StateEngineEntry} entryClass
 */
const addStateEntry = (entryClass) => {
  worldStateDefinitions[entryClass.forType] = entryClass;
};

module.exports.stateModule = {
  pre: [init],
  exec: [
    // Setting up the state entries.
    createStateEntries, validateStateEntries, modifyStateEntries, finalizeForProccessing,
    // Crunching the data.
    associateState, applyPreRules, superHappyRouletteTime,
    // Ensure the caches are updated before `post`.
    updateCaches
  ],
  post: [loadUpMemory]
};

module.exports.addStateEntry = addStateEntry;
module.exports.worldStateDefinitions = worldStateDefinitions;