/// <reference path="./context-mode.d.ts" />
/// <reference path="../commands/commands.d.ts" />
const { Plugin } = require("aid-bundler");
const { MatchCommand } = require("../commands");

/** @type {Map<string, ContextModeModule>} */
const registeredModules = new Map();

/**
 * @param {"input" | "context" | "output"} modifierKey
 * @returns {BundledModifierFn}
 */
exports.makeModifier = (modifierKey) => (data) => {
  const { useAI, state } = data;
  if (!useAI) return;

  // The "vanilla" module doesn't exist, but will cause it to noop.
  const theModule = registeredModules.get(state.$$contextMode || "vanilla");
  theModule?.[modifierKey]?.(data);
};

/** @type {Array<PatternCommandEntry>} */
const commandPatterns = [
  [/^set (.*)$/, (data, [newMode]) => {
    const fixedName = newMode.toLowerCase();
    if (fixedName !== "vanilla" && !registeredModules.has(fixedName)) {
      return [
        `No Context-Mode module named "${newMode}" is registered.`,
        "Use the sub-command \`list\` to get a list of available modes."
      ].join("\n");
    }

    data.state.$$contextMode = fixedName;
    return `Set context mode to: ${newMode}`;
  }],
  ["set", () => {
    return [
      "A single additional argument for `set` is required.",
      "Use the sub-command \`list\` to get a list of available modes."
    ].join("\n");
  }],
  ["list", () => {
    if (registeredModules.size === 0)
      return "Available context modes: vanilla";

    const regModes = [...registeredModules].map(([name]) => name);
    return `Available context modes: vanilla, ${regModes.join(", ")}`;
  }],
  ["current", (data) => {
    const { $$contextMode } = data.state;
    return `Current context mode is: ${$$contextMode || "vanilla"}`;
  }],
  [null, () => {
    return [
      "Unrecognized or missing sub-command.",
      "Available context-mode sub-commands:",
      "  set <module-name> - Sets the context-mode.",
      "  list - Lists all available modes.",
      "  current - Displays the current mode."
    ].join("\n");
  }]
];

exports.commands = [
  new MatchCommand("context-mode", new Map(commandPatterns))
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 * The `Pipeline` to add to.
 * @param {...ContextModeModule} contextModeModules
 * The context-mode modules to enable.
 */
exports.addPlugin = (pipeline, ...contextModeModules) => {
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

  for (const cmd of exports.commands)
    pipeline.commandHandler.addCommand(cmd);

  pipeline.addPlugin(new Plugin("Context-Mode",
    exports.makeModifier("input"),
    exports.makeModifier("context"),
    exports.makeModifier("output"),
  ));
};