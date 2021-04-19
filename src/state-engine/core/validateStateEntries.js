const { chain } = require("../../utils");
const { worldInfoString } = require("../utils");

/**
 * Validates newly parsed `StateEngineData`.  Will remove any that fail validation.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  for (const id of Object.keys(ctx.entriesMap)) {
    const entry = ctx.entriesMap[id];
    const results = entry.validator();
    if (results.length === 0) continue;
    delete ctx.entriesMap[id];

    const theIssues = ctx.validationIssues.get(id) ?? [];
    theIssues.push(...results);
    ctx.validationIssues.set(id, theIssues);
  }

  if (ctx.validationIssues.size === 0) return;

  data.useAI = false;
  data.message = chain(ctx.validationIssues)
    .map(([id, issues]) => [
      `\t${worldInfoString(ctx.worldInfoMap[id])}`,
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