/** @typedef {typeof import("./StateEngineEntry").StateEngineEntry} StateEngineEntryClass */

/** @type {Record<string, StateEngineEntryClass>} */
const worldStateDefinitions = {};

/**
 * Registers a `StateEngineEntry` class.
 * 
 * @param {StateEngineEntryClass} entryClass
 */
exports.addStateEntry = (entryClass) => {
  worldStateDefinitions[entryClass.forType] = entryClass;
};

/**
 * Fetches a `StateEngineEntry` class.
 * @param {string} type 
 * @returns {Maybe<StateEngineEntryClass>}
 */
exports.getStateEntry = (type) => {
  return worldStateDefinitions[type];
};