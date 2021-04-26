const { chain } = require("../../utils");

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

    const renderAs = entry.toString();
    const theIssues = ctx.validationIssues.get(renderAs) ?? [];
    theIssues.push(...results);
    ctx.validationIssues.set(renderAs, theIssues);
  }

  if (ctx.validationIssues.size === 0) return;

  data.useAI = false;
  data.message = chain(ctx.validationIssues)
    .map(([renderAs, issues]) => [
      `\t${renderAs}`,
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