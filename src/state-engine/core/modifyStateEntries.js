const { tuple2, chain, toPairs } = require("../../utils");

/**
 * @param {StateEngineEntry} entry
 * @returns {StateDataForModifier}
 */
const entryForModifier = (entry) => ({
  ...entry.toJSON(),
  // Clone the current state of the sets.
  relations: new Set(entry.relations),
  include: new Set(entry.include),
  exclude: new Set(entry.exclude)
});

/**
 * Applies modifiers to newly parsed and validated `StateEngineData`.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  const currentEntries = Object.values(ctx.entriesMap);

  // We need to store copies, as `modifier` will mutate instances.
  const allStates = chain(toPairs(ctx.entriesMap))
    .map(([id, entry]) => tuple2(id, entryForModifier(entry)))
    .value((kvps) => new Map(kvps));

  for (const entry of currentEntries) entry.modifier(allStates);
};