const { memoizedCounter } = require("../MatchableEntry");
const turnCache = require("../../turn-cache");

/**
 * Sets up shared context object.
 * 
 * @type {BundledModifierFn}
 */
 module.exports = (data) => {
  data.stateEngineContext = {
    matchCounter: memoizedCounter(),
    theCache: turnCache.forWrite(data, "StateEngine.association"),
    worldInfoMap: {},
    entriesMap: {},
    validationIssues: new Map(),
    sortedStateMatchers: [],
    workingHistory: [],
    stateAssociations: new Map(),
    scoresMap: new Map()
  };
};