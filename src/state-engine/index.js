/// <reference path="./state-engine.d.ts" />
/// <reference path="../commands/commands.d.ts" />
const { Plugin } = require("aid-bundler");
const { MatchCommand } = require("../commands");
const { flatMap, iterReverse, chain, toPairs, fromPairs, tuple2, getEntryText } = require("../utils");
const { makeExcerpt, stateDataString } = require("./utils");
const { stateModule: coreModule } = require("./core");
const { stateModule: vanillaModule } = require("./standard/vanilla");
const { stateModule: classModule } = require("./standard/class");
const turnCache = require("../turn-cache");

/**
 * Constructs an input modifier from the given list of `StateModule` instances.
 * 
 * @param {...StateModule} stateModules
 * @returns {BundledModifierFn}
 */
exports.mainModifier = (...stateModules) => {
  // Make sure the core module comes first, even if it was already in `stateModules`.
  // We also throw in the vanilla module, for backward compatibility.
  const theModules = new Set([coreModule, vanillaModule, classModule, ...stateModules]);
  const modifierFns = [
    ...flatMap(theModules, (m) => m.pre ?? []),
    ...flatMap(theModules, (m) => m.exec ?? []),
    // The `post` functions of modules are executed in reverse order.
    ...flatMap(iterReverse(theModules), (m) => m.post ?? [])
  ];

  return (data) => {
    if (!data.useAI) return;

    for (const modifierFn of modifierFns) {
      modifierFn(data);
      if (!data.useAI) return;
    }
  };
};

/**
 * @param {Record<string, WorldInfoEntry>} worldInfoMap 
 * @param {Record<string, StateEngineData>} stateDataCache
 * @param {Iterable<[string, StateEngineCacheData | null]>} entries
 */
const reportOnEntry = function* (worldInfoMap, stateDataCache, entries) {
  for (const [location, entry] of entries) {
    if (!entry) continue;
    const data = stateDataCache[entry.entryId];
    if (!data) continue;
    /** @type {WorldInfoEntry | undefined} */
    const info = worldInfoMap[entry.entryId];
    const { type, entryId, keys, text } = data;
    const textForExcerpt = text ?? (info ? getEntryText(info) : "");
    const ident = stateDataString({ type, entryId, keys });
    const score = entry.score.toFixed(2);
    const excerpt = textForExcerpt ? makeExcerpt(textForExcerpt) : "(No excerpt available.)";
    yield `${ident} (${score}) @ ${location}\n\t${excerpt}`;
  }
};

/**
 * Produces a report message for the given cache.
 * 
 * @param {AIDData} aidData 
 * @param {StateDataCache & { fromTurn: number }} storage 
 * @returns {string}
 */
const reportOnCache = (aidData, storage) => {
  const { $$stateDataCache = {} } = aidData.state;
  const worldInfoMap = fromPairs(aidData.worldEntries.map((wi) => tuple2(wi.id, wi)));
  const theHeader = `From turn ${storage.fromTurn} (${storage.phase || "unknown"} phase)`;
  const theReport = chain()
    .concat(storage.forContextMemory.map((v) => tuple2("Context Memory", v)))
    .concat(chain(toPairs(storage.forHistory)).map(([loc, entry]) => [`History ${loc}`, entry]).value())
    .concat([tuple2("Author's Note", storage.forAuthorsNote)])
    .concat([tuple2("Front Memory", storage.forFrontMemory)])
    .thru((entries) => reportOnEntry(worldInfoMap, $$stateDataCache, entries))
    .toArray()
    .join("\n");

  return `${theHeader}\n\n${theReport}`;
};

/**
 * Emits the cache data starting from the current turn and back into the past.
 * 
 * @param {AIDData} aidData
 * @returns {Iterable<StateDataCache & { fromTurn: number }>}
 */
const emitCacheData = function* (aidData) {
  for (let ac = aidData.actionCount; ac >= 0; ac--) {
    /** @type {StateDataCache | undefined} */
    const theCache = turnCache.inspectAt(aidData, "StateEngine.association", ac);
    if (theCache == null) continue;
    yield { ...theCache, fromTurn: ac };
  }
};

/** @type {Array<[string | RegExp, SimpleCommandHandler]>} */
const commandPatterns = [
  // Reports more readable information about the latest turn.
  ["report latest", (data) => {
    /** @type {import("../turn-cache").ReadCache<StateDataCache>} */
    const theCache = turnCache.forRead(data, "StateEngine.association", { loose: true });
    const { storage } = theCache;
    if (!storage) return "No State-Engine data is available.";
    return reportOnCache(data, { ...storage, fromTurn: theCache.fromTurn });
  }],
  // Reports more readable information about the last likely player-instigated turn.
  ["report", (data) => {
    const [latestTurn, prevTurn] = emitCacheData(data);
    if (!latestTurn) return "No State-Engine data is available.";
    if (latestTurn.phase === "input") return reportOnCache(data, latestTurn);
    if (prevTurn?.phase === "input") return reportOnCache(data, prevTurn);
    if (prevTurn?.phase === "output") return reportOnCache(data, prevTurn);
    return reportOnCache(data, latestTurn);
  }],
  // Debug command; clears the cache.
  ["reset", (data) => {
    delete data.state.$$stateDataCache;
    turnCache.clearCache(data, "StateEngine.association");
    return "Cleared State Engine caches.";
  }]
];

exports.commands = [
  new MatchCommand("state-engine", new Map(commandPatterns))
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline 
 * @param  {...any} stateModules 
 */
exports.addPlugin = (pipeline, ...stateModules) => {
  for (const cmd of exports.commands)
    pipeline.commandHandler.addCommand(cmd);
  
  const theModifier = exports.mainModifier(...stateModules);
  pipeline.addPlugin(new Plugin("State Engine", theModifier, undefined, theModifier));
};
