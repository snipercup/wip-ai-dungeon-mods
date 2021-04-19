const { tuple2, fromPairs } = require("../../utils");
const { BadStateEntryError, extractType } = require("../StateEngineEntry");
const { getStateEntry } = require("../registry");

/**
 * Parses World Info entries into State Engine entries.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { worldEntries, stateEngineContext: ctx } = data;
  ctx.worldInfoMap = fromPairs(worldEntries.map((wi) => tuple2(wi.id, wi)));

  /** @type {(id: string) => string | undefined} */
  const createEntry = (id) => {
    try {
      const worldInfo = ctx.worldInfoMap[id];
      const entryType = extractType(worldInfo) ?? "VanillaEntry";
      const EntryClass = getStateEntry(entryType);
      if (!EntryClass) return `Unknown entry type: \`${entryType}\``;

      const newEntry = new EntryClass(worldInfo);
      if (!newEntry)
        return `World info could not be parsed.`;
        ctx.entriesMap[id] = newEntry;
    }
    catch (err) {
      if (err instanceof BadStateEntryError) return err.message;
      throw err;
    }
  };
  
  // Perform entry construction.
  for (const id of Object.keys(ctx.worldInfoMap)) {
    const maybeIssue = createEntry(id);
    if (!maybeIssue) continue;
    const theIssues = ctx.validationIssues.get(id) ?? [];
    theIssues.push(maybeIssue);
    ctx.validationIssues.set(id, theIssues);
  }
};