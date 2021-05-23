/// <reference path="./with-memory.d.ts" />
const { Plugin } = require("aid-bundler");
const { SimpleCommand } = require("../commands");
const turnCache = require("../turn-cache");

/**
 * With-Memory
 * 
 * Extracts and tracks the adventure summary and adds `memory` and `summary`
 * properties to the `AIDData` instance for use by other plugins.  Should be
 * installed as early as possible in the pipeline, typically after the commands.
 * 
 * This will automatically remove lines starting with `#`.  If the immediate next
 * line after a `#` line starts with `"The story so far:"`, it will take all lines
 * after it and treat it as the AI-generated summary.
 * 
 * The plugin will also try to keep the summary consistent with undo/redo, but
 * there are some caveats with this:
 * - The script can't tell when the Adventure Summary is on or off; it can only
 *   see if the generated strings are there or not.
 * - This script cannot tell the difference between tweaks made by the player to
 *   the summary and updates done by the AI.
 * - If no summary is detected, it will set an empty-string `""` to `summary`.
 * 
 * The leading `"The story so far:"` is included in the `summary` property, even
 * though it discards it internally.  Make sure you remove it if you do not want it.
 */

const reHash = /^#(.*?)$/;
const reStorySoFar = /^The story so far:\s+((?:.|\s)*?)$/i;

/**
 * @typedef Extraction
 * @prop {string} playerMemory
 * @prop {string} summary
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @returns {Extraction}
 */
const extractMemory = (data) => {
  const memoryParts = data.givenPlayerMemory.split("\n");
  const memoryOut = [];
  let afterHash = false;
  let summaryOut = [];
  for (let line of memoryParts) {
    line = line.trim();

    if (reHash.test(line)) {
      afterHash = true;
      continue;
    }

    if (afterHash) {
      if (line) summaryOut.push(line);
      continue;
    }
    
    if (line) memoryOut.push(line);
  }

  // @ts-ignore - More of those TS4 bugs.
  const [, finalSummary = ""] = reStorySoFar.exec(summaryOut.join("\n")) ?? [];
  return { playerMemory: memoryOut.join("\n"), summary: finalSummary };
};

/**
 * The input modifier for the plugin.  Handles the cache updates.
 * 
 * @type {BundledModifierFn}
 */
exports.inputModifier = (data) => {
  if (!data.useAI) return;
  delete data.state.$$reportSummaryInOutputModifier;

  const { playerMemory, summary: newSummary } = extractMemory(data);
  /** @type {import("../turn-cache").UpdateCache<string>} */
  const theCache = turnCache.forUpdate(data, "WithMemory.summary", { loose: true });
  if (newSummary) {
    // Try to commit the summary to the cache.
    const { $$latestSummary, $$reportSummary } = data.state;
    if (!$$latestSummary || $$latestSummary !== newSummary) {
      theCache.storage = newSummary;
      theCache.commit();

      data.state.$$latestSummary = newSummary;
      if ($$reportSummary)
        data.state.$$reportSummaryInOutputModifier = true;
    }
  }
  
  const summary = theCache.storage ? `The story so far: ${theCache.storage}` : "";
  Object.assign(data, { playerMemory, summary });
};

/**
 * The context (and output) modifier of the plugin.  Only sets the props on the
 * `AIDData` instance; does not alter the cache.
 * 
 * @type {BundledModifierFn}
 */
exports.contextModifier = (data) => {
  if (!data.useAI) return;

  const { playerMemory } = extractMemory(data);
  /** @type {import("../turn-cache").ReadCache<string>} */
  const theCache = turnCache.forRead(data, "WithMemory.summary", { loose: true });
  const summary = theCache.storage ? `The story so far: ${theCache.storage}` : "";
  Object.assign(data, { playerMemory, summary });
};

/**
 * The output modifier of the plugin.  Only sets the props on the `AIDData`
 * instance; does not alter the cache.  Also handles setting the `state.message`
 * when a summary update was detected in the input modifier.
 * 
 * @type {BundledModifierFn}
 */
exports.outputModifier = (data) => {
  if (!data.useAI) return;
  exports.contextModifier(data);

  const { $$reportSummaryInOutputModifier, $$latestSummary } = data.state;
  if ($$reportSummaryInOutputModifier && !data.message)
    data.message = `The story so far: ${$$latestSummary}`;

  delete data.state.$$reportSummaryInOutputModifier;
};

const isYes = ["on", "1", "true", "yes"];
const isNo = ["off", "0", "false", "no"];

exports.commands = [
  new SimpleCommand("report-summary-updates", (data, [arg]) => {
    if (!arg) {
      const currentState = data.state.$$reportSummary ? "reporting" : "not reporting";
      return `Currently ${currentState} summary updates.  Repeat the command with "on" or "off" to change.`
    }
    if (isYes.includes(arg.toLowerCase())) {
      data.state.$$reportSummary = true;
      return "Will report summary updates.";
    }
    if (isNo.includes(arg.toLowerCase())) {
      data.state.$$reportSummary = false;
      return "Will not report summary updates.";
    }

    return [
      "Didn't understand; repeat the command.",
      "Do you want me to report summary updates (on) or not (off)?"
    ].join("\n");
  }),
  new SimpleCommand("report-summary", (data) => {
    /** @type {import("../turn-cache").ReadCache<string>} */
    const theCache = turnCache.forRead(data, "WithMemory.summary", { loose: true });
    if (theCache.storage) return `The story so far: ${theCache.storage}`;
    return "(No summary has yet been recorded yet.)";
  }),
  new SimpleCommand("reset-with-memory", (data) => {
    delete data.state.$$latestSummary;
    turnCache.clearCache(data, "WithMemory.summary");
    return "Cleared With-Memory caches.";
  }),
  new SimpleCommand("set-authors-note", (data, args) => {
    const newNote = args.join(" ");
    if (!newNote) {
      delete data.state.memory.authorsNote;
      data.state.$$setAuthorsNote = false;
      return "Removed the author's note.";
    }
    else {
      data.state.memory.authorsNote = newNote;
      data.state.$$setAuthorsNote = true;
      return `Author's note set to: ${newNote}`;
    }
  })
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 */
exports.addPlugin = (pipeline) => {
  for (const cmd of exports.commands)
    pipeline.commandHandler.addCommand(cmd);

  pipeline.addPlugin(new Plugin("With-Memory",
    exports.inputModifier,
    exports.contextModifier,
    exports.outputModifier
  ));
};