const { tuple2, fromPairs } = require("../../utils");
const { BadStateEntryError } = require("../StateEngineEntry");
const { allStateEntries } = require("../registry");

/**
 * Parses World Info entries into State Engine entries.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;
  
  // Perform entry construction.
  for (const entryClass of allStateEntries())
    for (const newEntry of entryClass.produceEntries(data, ctx.validationIssues))
      ctx.entriesMap[newEntry.entryId] = newEntry;
};