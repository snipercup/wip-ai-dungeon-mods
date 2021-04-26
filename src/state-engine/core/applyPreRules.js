const { associationsHelper, getAssociationSet, makePreRuleIterators } = require("./_helpers");

/**
 * Refines the state associations, applying the pre-rule for each type of state
 * data to allow them to fit specific purposes.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  for (const [matcher, { source }] of associationsHelper(data)) {
    const theSet = getAssociationSet(ctx, source);
    if (!theSet?.has(matcher.entryId)) continue;

    const neighbors = makePreRuleIterators(ctx, matcher.stateEntry, source);
    const result = matcher.stateEntry.preRules(matcher, source, neighbors);
    if (!result) theSet.delete(matcher.entryId);
  }
};