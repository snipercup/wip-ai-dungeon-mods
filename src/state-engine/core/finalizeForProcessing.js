const { escapeRegExp } = require("../../utils");
const { entryCount } = require("../config");

/**
 * @param {StateEngineEntry} source
 * @param {StateEngineEntry} target
 */
const countOfUniqueKeys = (source, target) => {
  if (source.keys.size === 0) return 0;

  let count = 0;
  for (const srcKey of source.keys)
    if (!target.keys.has(srcKey)) count += 1;
  return count;
};

/**
 * Sorts `StateEngineData`.  Data with relations to other data are sorted toward
 * the end, so they are evaluated last and will be able to look up if the related
 * data was matched.
 * 
 * @param {StateEngineEntry} a 
 * @param {StateEngineEntry} b 
 */
const stateSorter = (a, b) => {
  // When one references the other, sort the one doing the referencing later.
  // It is possible that they reference each other; this is undefined behavior.
  if (a.relator.isInterestedIn(b.keys)) return 1;
  if (b.relator.isInterestedIn(a.keys)) return -1;

  // When one has more relations, sort that one later.
  const relCount = a.relator.keysOfInterest.size - b.relator.keysOfInterest.size;
  if (relCount !== 0) return relCount;

  // Compare the keys, sorting the entry with more unique keys down.
  const aCount = countOfUniqueKeys(a, b);
  const bCount = countOfUniqueKeys(b, a);
  if (aCount !== bCount) return aCount - bCount;

  return 0;
};

/**
 * Matches the type of input mode the player performed to submit the input.
 * This information is not currently provided by the API, and I like normalized data.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @returns {"do" | "say" | "story"}
 */
const parseInputMode = (data) => {
  const { info: { characters }, text } = data;
  const allCharacters = characters
    .map((pi) => pi.name?.trim())
    .filter(Boolean)
    .map((name) => escapeRegExp(name));
  const charMatch = ["you", ...allCharacters].join("|");

  // Check for `say` first, since it is more ambiguous than `do`.
  if (new RegExp(`^\\>\\s+(?:${charMatch}) says?`, "i").test(text)) return "say";
  if (new RegExp(`^\\>\\s+(?:${charMatch})`, "i").test(text)) return "do";
  return "story";
};

/**
 * Finalizes the internal state before processing.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;
  const { text, history } = data;

  ctx.workingHistory = [...history.slice(-1 * entryCount), { text, type: parseInputMode(data) }];

  ctx.sortedStateMatchers = Object.keys(ctx.entriesMap)
    .map((id) => ctx.entriesMap[id])
    .sort(stateSorter)
    .map((sd) => sd.toMatchable(ctx.matchCounter));
};