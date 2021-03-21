/// <reference path="../state-engine/state-engine.d.ts" />
const { chain, toPairs, fromPairs, tuple2 } = require("../utils");
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
      const newTurn = Number(key) - theShift;
      const newData
        = typeof data.source !== "number" ? data
        : { ...data, source: data.source - theShift };
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