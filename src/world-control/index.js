/// <reference path="./world-control.d.ts" />
const { Plugin } = require("aid-bundler");
const { MatchCommand } = require("../commands");

/**
 * World Control
 * 
 * Adds commands that show and hide world-info entries that were created by the
 * scenario and its scripts.  This list is only created once, at the start of the
 * game or after the plugin is introduced, so entries that are programmatically
 * generated and later revealed are not interfered with.
 * 
 * Additional commands are also provided to have more fine-grained control, but
 * are also more-or-less debug commands.
 */

/**
 * The output modifier of the plugin.  Sweeps through all entries, recording
 * any that are hidden and creates the `$$worldInfoVisibility` set.
 * 
 * The set is only built once, at the beginning of the game or after the plugin
 * has been introduced to the scenario.
 * 
 * @type {BundledModifierFn}
 */
exports.outputModifier = (data) => {
  if (data.state.$$worldInfoVisibility) return;
  /** @type {Exclude<GameState["$$worldInfoVisibility"], undefined>} */
  const visibilitySet = {};
  for (const worldInfo of data.worldEntries) {
    if (worldInfo.hidden === false) continue;
    visibilitySet[worldInfo.id] = true;
  }
  
  data.state.$$worldInfoVisibility = visibilitySet;
};

/**
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} data 
 * @param {number} index 
 * @param {boolean} hidden 
 * @returns 
 */
const updateAtIndex = (data, index, hidden) => {
  if (index === -1) return false;

  const worldInfo = data.worldEntries[index];
  if (!worldInfo) return false;
  if (worldInfo.hidden === hidden) return false;
  // The argument expects the inverse.
  updateWorldEntry(index, worldInfo.keys, worldInfo.entry, hidden);
  return true;
};

/**
 * Performs the work of the commands, altering the world-info entries.
 * Returns the number of entries affected.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} data 
 * @param {boolean} hidden 
 * @returns {number}
 */
const updaterFn = (data, hidden) => {
  const { $$worldInfoVisibility = {} } = data.state;
  const ids = Object.keys($$worldInfoVisibility);
  if (ids.length === 0) return 0;

  let alteredCount = 0;
  for (const id of ids) {
    const index = data.worldEntries.findIndex((entry) => entry.id === id);
    if (updateAtIndex(data, index, hidden)) alteredCount += 1;
  }

  return alteredCount;
};

/** @type {Array<[string | RegExp, SimpleCommandHandler]>} */
const commandPatterns = [
  // Shows all world-info entries that were hidden at the start of the scenario.
  ["show", (data) => {
    const revealedCount = updaterFn(data, false);
    if (revealedCount > 0)
      return `Revealed ${revealedCount} hidden scenario world-info entries.`;
    else
      return "All scenario world-info entries are already revealed.";
  }],
  // Shows a list of world-info indices, forcfully.
  [/^show index \d+(?: \d+)*$/i, (data, args) => {
    const [,, ...indexStrs] = args;
    let found = 0;
    for (const indexStr of indexStrs)
      if (updateAtIndex(data, Number(indexStr), false))
        found += 1;

    return `Revealed ${found} out of ${indexStrs.length} entries.`;
  }],
  // Hides all world-info entries that were hidden at the start of the scenario.
  ["hide", (data) => {
    const hiddenCount = updaterFn(data, true);
    if (hiddenCount > 0)
      return `Restored ${hiddenCount} scenario world-info entries to their original state.`;
    else
      return "All scenario world-info entries are already hidden.";
  }],
  // Hides a list of world-info indices, forcfully.
  [/^hide index \d+(?: \d+)*$/i, (data, args) => {
    const [,, ...indexStrs] = args;
    let found = 0;
    for (const indexStr of indexStrs)
      if (updateAtIndex(data, Number(indexStr), true))
        found += 1;

    return `Hid ${found} out of ${indexStrs.length} entries.`;
  }],
  // Debug command; reports world-info entry to console for inspection.
  [/^report (\d+)$/i, (data, [index]) => {
    const worldInfo = data.worldEntries[Number(index)];
    if (worldInfo) {
      console.log(worldInfo);
      return `Reported world-info at index ${index} to console.`;
    }
    return `Could not locate a world-info at index ${index}`;
  }],
  // Debug command; rebuilds the set of world-info entries based on the current state.
  ["rebuild", (data) => {
    delete data.state.$$worldInfoVisibility;
    exports.outputModifier(data);
    return "Rebuilt set of scenario world-info entries.";
  }],
  // Debug command; clears the storage of which world-info entries were hidden at scenario start.
  ["reset", (data) => {
    delete data.state.$$worldInfoVisibility;
    return "Cleared set of scenario world-info entries.";
  }]
];

exports.commands = [
  new MatchCommand("world-control", new Map(commandPatterns))
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 */
exports.addPlugin = (pipeline) => {
  for (const cmd of exports.commands)
    pipeline.commandHandler.addCommand(cmd);

  pipeline.addPlugin(new Plugin("World Control",
    undefined,
    undefined,
    exports.outputModifier
  ));
};