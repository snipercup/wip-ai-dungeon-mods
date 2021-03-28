/// <reference path="../state-engine/state-engine.d.ts" />
const { chain, toPairs, fromPairs, tuple2, iterReverse } = require("../utils");
const turnCache = require("../turn-cache");

/**
 * Gets the nearest association cache object for the current turn.  If an exact
 * match can't be found, it will pull the one immediately before, with its `forHistory`
 * sources shifted accordingly.
 * 
 * It can return `undefined` if no suitable match could be found, such as if the
 * history was undone farther than the cache had memory for.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * @returns {Maybe<StateDataCache>}
 */
module.exports.getClosestCache = (aidData) => {
  /** @type {import("../turn-cache").ReadCache<StateDataCache>} */
  const theCache = turnCache.forRead(aidData, "StateEngine.association", { loose: true });
  const { actionCount } = aidData;
  const { storage, fromTurn } = theCache;
  if (!storage || fromTurn === actionCount) return storage;

  // We can shift this entry to make it usable.
  const theShift = actionCount - fromTurn;
  const newHistory = chain(toPairs(storage.forHistory))
    .map(([key, data]) => {
      const newTurn = Number(key) + theShift;
      const newData
        = typeof data.source !== "number" ? data
        : { ...data, source: data.source + theShift };
      return tuple2(newTurn, newData);
    })
    .value((kvps) => fromPairs(kvps));
  return { ...storage, forHistory: newHistory };
};

/**
 * Obtains the State Engine entry from `state.$$stateDataCache`.  Augments it
 * with information you're likely to want while processing the context.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * @param {Maybe<StateEngineCacheData>} assocData
 * @returns {Maybe<ContextData>}
 */
module.exports.getStateEngineData = (aidData, assocData) => {
  if (assocData == null) return undefined;

  // Does the cache exist?
  const { $$stateDataCache } = aidData.state;
  if (!$$stateDataCache) return undefined;

  // Does it have this world-info's parsed data?
  const stateData = $$stateDataCache[assocData.infoId];
  if (!stateData) return undefined;

  // Can we find the world-info's text?
  const worldInfo = aidData.worldEntries.find((wi) => wi.id === assocData.infoId);
  if (!worldInfo) return undefined;

  // Does it contain text?
  const text = worldInfo.entry.trim();
  if (!text) return undefined;

  const { score, priority, source } = assocData;
  return { ...stateData, worldInfo, score, priority, source, text };
};

/**
 * Cleans up a string for presentation in the context, removing useless
 * characters from the output.
 * 
 * @param {string} text 
 * @returns {string[]}
 */
module.exports.cleanText = (text) =>
  text.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/** Matches any string that appears to start with a new line. */
const reNewLine = /^\s*?\n/;

/**
 * Attempts to create a `HistoryData` object from the given information.
 * 
 * @param {number} offset 
 * @param {HistoryData["sources"]} sources 
 * @param {number} totalLength
 * @param {string[]} textParts 
 * @returns {Maybe<HistoryData>}
 */
const createHistoryData = (offset, sources, totalLength, textParts) => {
  if (textParts.length === 0 || sources.size === 0) return undefined;
  const text = module.exports.cleanText(textParts.join("")).join("\n");
  if (!text) return undefined;

  // We can preserve the type if only one type is in the whole batch.
  // This can happen if the player happens to hit "continue" a lot.
  const rawSources = [...sources.values()];
  const baseType = rawSources[0].type;
  const type = rawSources.every(({ type }) => type === baseType) ? baseType : "combined";
  // Only add the extra character (for a new-line) if this isn't the latest entry.
  const lengthToHere = totalLength <= 0 ? text.length : totalLength + text.length + 1;
  return { offset, sources, type, lengthToHere, text };
};

/**
 * Reformats the history entries, combining them into a single entry when the
 * AI continued from the previous entry (IE: it did not start a new paragraph).
 * 
 * This function will iterate in reverse, so the entry with an `offset` of `0`
 * is the very latest entry in the history.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * @returns {Iterable<HistoryData>}
 */
module.exports.buildHistoryData = function* (aidData) {
  let nextYield = 0;
  let curOffset = 0;
  /** @type {HistoryData["sources"]} */
  let sources = new Map();
  /** @type {string[]} */
  let textInProgress = [];
  let totalLength = 0;
  for (const entry of iterReverse(aidData.history)) {
    const curText = entry.text;

    // No trimming or anything.  Just put it in as-is.
    textInProgress.push(curText);
    sources.set(curOffset, entry);
    curOffset += 1;

    if (reNewLine.test(curText)) {
      // We need to yield the next batch, if there's something to yield.
      // Don't forget, we're iterating in reverse, so make sure the parts are un-reversed.
      const nextData = createHistoryData(nextYield, sources, totalLength, textInProgress.reverse());
      if (nextData) {
        yield nextData;
        totalLength = nextData.lengthToHere;
        nextYield += 1;
      }
      textInProgress = [];
      sources = new Map();
    }
  }

  // Before we leave, make sure we yield the last bit of text.
  const nextData = createHistoryData(nextYield, sources, totalLength, textInProgress.reverse());
  if (nextData) yield nextData;
};

/**
 * Gets the length of a string, as if it were contributing to an `Array.join`.
 * 
 * @param {string | number} value
 * The string or a number representing a string's length.
 * @param {string} [joiner]
 * The string that will be used to join them; defaults to `"\n"`.
 * @returns {number}
 */
module.exports.usedLength = (value, joiner = "\n") => {
  const length = typeof value === "string" ? value.length : value;
  return length > 0 ? length + joiner.length : 0;
};

/**
 * A function for `Array.reduce` that sums all the lengths in an array.
 * Accepts both a raw `string` to calculate the length from or a pre-calculated
 * `number` length.
 * 
 * @param {string} [joiner]
 * The string that will be used to join them; defaults to `"\n"`.
 * @returns {(acc: number, next: string | number) => number}
 */
module.exports.sumOfUsed = (joiner = "\n") => (acc, next) =>
  acc + module.exports.usedLength(next, joiner);

/**
 * Gets the length of an iterable of strings, as if joined together with `joiner`.
 * 
 * @param {string | string[] | Iterable<string>} value
 * The value to calculate the length for.
 * @param {string} [joiner]
 * The string that will be used to join them; defaults to `"\n"`.
 * @returns {number}
 */
module.exports.joinedLength = (value, joiner = "\n") => {
  if (typeof value === "string") return value.length;
  let count = 0;
  let totalLength = 0;
  for (const str of value) {
    totalLength += str.length;
    count += 1;
  }

  return totalLength + (count > 0 ? (count - 1) * joiner.length : 0);
};