/// <reference path="./state-engine.d.ts" />
/// <reference path="../commands/commands.d.ts" />
const { Plugin } = require("aid-bundler");
const { SimpleCommand } = require("../commands");
const { flatMap, iterReverse } = require("../utils");
const { stateModule: coreModule } = require("./core");
const { stateModule: vanillaModule } = require("./vanilla");
const turnCache = require("../turn-cache");

/**
 * Constructs an input modifier from the given list of `StateModule` instances.
 * 
 * @param {...StateModule} stateModules
 * @returns {BundledModifierFn}
 */
module.exports.inputModifier = (...stateModules) => {
  // Make sure the core module comes first, even if it was already in `stateModules`.
  // We also throw in the vanilla module, for backward compatibility.
  const theModules = new Set([coreModule, vanillaModule, ...stateModules]);
  const modifierFns = [
    ...flatMap(theModules, (m) => m.pre ?? []),
    ...flatMap(theModules, (m) => m.exec ?? []),
    // The `post` functions of modules are executed in reverse order.
    ...flatMap(iterReverse(theModules), (m) => m.post ?? [])
  ];

  return (data) => {
    if (!data.useAI) return;

    for (const modifierFn of modifierFns) {
      modifierFn(data);
      if (!data.useAI) return;
    }
  };
};

module.exports.commands = [
  new SimpleCommand("reset-state-engine", (data) => {
    delete data.state.$$stateDataCache;
    turnCache.clearCache(data, "StateEngine.association");
    return "Cleared State Engine caches.";
  })
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline 
 * @param  {...any} stateModules 
 */
module.exports.addPlugin = (pipeline, ...stateModules) => {
  for (const cmd of module.exports.commands)
    pipeline.commandHandler.addCommand(cmd);

  pipeline.addPlugin(new Plugin("State Engine",
    module.exports.inputModifier(...stateModules)
  ));
};
