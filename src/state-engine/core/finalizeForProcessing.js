const { escapeRegExp } = require("../../utils");
const { entryCount } = require("../config");

/**
 * Sorts `StateEngineData`.  Data with relations to other data are sorted toward
 * the end, so they are evaluated last and will be able to look up if the related
 * data was matched.
 * 
 * @param {StateEngineEntry} a 
 * @param {StateEngineEntry} b 
 */
const stateSorter = (a, b) => {
  // When one has a key and the other doesn't, sort the key'd one later.
  const aHasKey = Boolean(a.key);
  if (aHasKey !== Boolean(b.key)) return aHasKey ? 1 : -1;

  // When one has more references, sort that one later.
  const refCount = a.relations.size - b.relations.size;
  if (refCount !== 0) return refCount;

  // When one references the other, sort the one doing the referencing later.
  // It is possible that they reference each other; this is undefined behavior.
  if (b.key && a.relations.has(b.key)) return 1;
  if (a.key && b.relations.has(a.key)) return -1;

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