/// <reference path="./turn-cache.d.ts" />
const { chain, toPairs, fromPairs, tuple2 } = require("../utils");

/**
 * @param {TurnCacheData<any>} stateStorage
 * @param {number} actionCount
 * @returns {[number, any] | undefined}
 */
 const getClosestCache = (stateStorage, actionCount) => {
  if (!stateStorage) return undefined;

  const sortedCache = chain(toPairs(stateStorage))
    .map(([key, cacheObj]) => tuple2(Number(key), cacheObj))
    .value((kvps) => [...kvps].sort(([a], [b]) => a - b));

  let earliestEntry;
  for (const currentEntry of sortedCache) {
    earliestEntry = currentEntry;
    const [turn] = currentEntry;
    if (turn === actionCount) return currentEntry;
  }

  // No suitable entry found, object was empty.
  if (!earliestEntry) return undefined;

  const [turn] = earliestEntry;
  // The earliest entry is still later than the current turn; nothing usable.
  if (turn > actionCount) return undefined;
  return earliestEntry;
};

/**
 * @param {TurnCacheData<CachableType> | undefined} localStorage 
 * @param {number} actionCount 
 * @param {boolean} loose 
 * @returns {[number, CachableType | undefined]}
 */
module.exports.getFromStorage = (localStorage, actionCount, loose) => {
  if (localStorage == null)
    return tuple2(actionCount, undefined);
  if (!loose)
    return tuple2(actionCount, localStorage[actionCount]);

  return getClosestCache(localStorage, actionCount) ?? tuple2(actionCount, undefined);
};

/**
 * @param {TurnCacheData<CachableType> | undefined} localStorage 
 * @param {number} actionCount 
 * @param {boolean} loose 
 * @returns {[number, any]}
 */
module.exports.cloneFromStorage = (localStorage, actionCount, loose) => {
  const original = module.exports.getFromStorage(localStorage, actionCount, loose);
  if (original[1] == null) return original;

  const [turn, storage] = original;
  const clone = JSON.parse(JSON.stringify(storage));
  return tuple2(turn, clone);
};

/**
 * Performs maintenance on the cache, removing nullish, old, and out-of-scope entries.
 * 
 * @param {TurnCacheData<CachableType>} localStorage
 * @param {number} actionCount
 * @param {number} storageSize
 * @returns {TurnCacheData<any>}
 */
module.exports.cleanCache = (localStorage, actionCount, storageSize) => {
  const entryKVPs = Object.keys(localStorage)
    .map(Number)
    .filter((v) => !Number.isNaN(v))
    .filter((n) => n <= actionCount)
    .sort((a, b) => a - b)
    .map((n) => tuple2(n, localStorage[n]))
    .filter(([, storage]) => storage != null)
    .slice(-1 * storageSize);

  return fromPairs(entryKVPs);
};