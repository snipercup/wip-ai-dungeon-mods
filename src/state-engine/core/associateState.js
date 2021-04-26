const { associationsHelper, getAssociationSet } = require("./_helpers");

/**
 * Goes through the available texts, determining which `StateEngineEntry` objects
 * match with what text.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  /** @type {UsedKeysMap} */
  const usedKeys = new Map();

  for (const [matcher, params] of associationsHelper(data, usedKeys)) {
    const result = matcher.stateEntry.associator(matcher, params);
    if (result) getAssociationSet(ctx, params.source, true).add(matcher.entryId);
  }

  //console.log([...usedKeys].map(([key, theSet]) => `${key} uses: ${[...theSet].join(", ")}`));
};