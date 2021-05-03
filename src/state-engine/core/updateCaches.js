const { toPairs, fromPairs, chain } = require("../../utils");
const { entrySorter } = require("../entrySorting");

/**
 * Dumps everything into the game-state caches.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { state, stateEngineContext: ctx } = data;

  // And now, we construct the object for the turn cache.
  /** @type {StateDataCache} */
  const newCacheData = {
    forContextMemory: [],
    forFrontMemory: null,
    forAuthorsNote: null,
    forHistory: {}
  };
  for (const [source, theSet] of ctx.stateAssociations) {
    for (const id of theSet) {
      const entry = ctx.entriesMap[id];
      const score = ctx.scoresMap.get(source)?.get(id) ?? 0;
      const priority = entry.priority ?? null;
      const entryData = { entryId: id, score, priority, source };
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
    .thru(entrySorter)
    .map(({ order, ...data }) => data)
    .toArray();

  // Put it where it belongs.
  ctx.theCache.storage = newCacheData;
  ctx.theCache.commit();

  // Finally, update the parsed entry cache and we're done!
  // @ts-ignore - Why are you bothering with this, TS?  Stupid!
  state.$$stateDataCache = chain(toPairs(ctx.entriesMap))
    .map(([k, entry]) => [k, entry.toJSON()])
    .value((kvps) => fromPairs(kvps));
};