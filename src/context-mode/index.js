/// <reference path="./context-mode.d.ts" />
/// <reference path="../commands/commands.d.ts" />
const { Plugin } = require("aid-bundler");
const { parseArgs } = require("../commands/utils");

/** @type {Map<string, ContextModeModule>} */
const registeredModules = new Map();

/**
 * @param {"input" | "context" | "output"} modifierKey
 * @returns {BundledModifierFn}
 */
module.exports.makeModifier = (modifierKey) => (data) => {
  const { useAI, state } = data;
  if (!useAI) return;

  // The "vanilla" module doesn't exist, but will cause it to noop.
  const theModule = registeredModules.get(state.$$contextMode || "vanilla");
  theModule?.[modifierKey]?.(data);
};

/** @type {CommandMap} */
module.exports.commands = {
  "context-mode": (data, arg) => {
    data.text = "";

    const [newMode] = parseArgs(arg);
    if (!newMode)
      return "A single argument is required.";

    const fixedName = newMode.toLowerCase();
    if (fixedName !== "vanilla" && !registeredModules.has(fixedName)) {
      return [
        `No Context-Mode module named "${newMode}" exists.`,
        "Use the name \"vanilla\" to disable this modifier."
      ].join("\n");
    }

    data.state.$$contextMode = fixedName;
    return `Set context mode to: ${newMode}`;
  }
};

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 * The `Pipeline` to add to.
 * @param {...ContextModeModule} contextModeModules
 * The context-mode modules to enable.
 */
module.exports.addPlugin = (pipeline, ...contextModeModules) => {
  // No reason to even bother if there's no modules to use.
  if (contextModeModules.length === 0) return;

  for (const module of contextModeModules) {
    if (!module.name)
      throw new Error("All Context-Mode modules must have a `name`.");

    const fixedName = module.name.toLowerCase();
    if (fixedName === "vanilla")
      throw new Error("The Context-Mode module name \"vanilla\" is reserved.");

    registeredModules.set(fixedName, module);
  }

  pipeline.addPlugin(new Plugin("Context-Mode",
    module.exports.makeModifier("input"),
    module.exports.makeModifier("context"),
    module.exports.makeModifier("output"),
  ));
};