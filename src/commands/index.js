/// <reference path="./commands.d.ts" />
const { Plugin } = require("aid-bundler");

/**
 * Commands
 * Simple command system.  Uses a leading `:` character for matching.
 */

const reRemoveFluff = /^(?:\s*|\>\s+)?(?:[yY]ou\s+)?(?:say\s+)?"?(.+?)"?$/;
const reCommand = /^:(.+?)(?:\s+(.+))?$/;

/**
 * Constructs an input modifier that can detect and execute the given commands.
 * 
 * @param {...CommandMap} commands
 * The commands to enable.
 * @returns {BundledModifierFn}
 */
 module.exports.inputModifier = (...commands) => {
   /** @type {CommandMap} */
  const theCommands = Object.assign({}, ...commands);

  return (data) => {
    if (!data.useAI) return;

    const [, text] = reRemoveFluff.exec(data.text.trim()) ?? [];
    if (!text) return;

    const [, command, arg = ""] = reCommand.exec(text) ?? [];
    if (!command) return;

    // When a command matches, disable the AI by default.
    // The command can turn it back on by flipping this back to `true`.
    data.useAI = false;

    if (typeof theCommands[command] === "function") {
      const output = theCommands[command](data, arg);
      if (output && typeof output === "string")
        data.state.message = output;
    }
    else {
      data.state.message = `Unknown command: ${command}`;
    }
  };
};

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 * The `Pipeline` to add to.
 * @param  {...CommandMap} commands
 * The commands to enable.
 */
 module.exports.addPlugin = (pipeline, ...commands) => {
  pipeline.addPlugin(new Plugin("Commands",
    module.exports.inputModifier(...commands)
  ));
};