/// <reference path="./config-commander.d.ts" />
/// <reference path="../state-engine/state-engine.d.ts" />
const { Plugin } = require("aid-bundler");
const { dew, chain } = require("../utils");
const { MatchCommand } = require("../commands");
const { stateModule } = require("./state-module");
const { ConfigNamespace } = require("./ConfigNamespace");

/**
 * Executes the commands specified in `$Config` world-info objects.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 * @returns {BundledModifierFn}
 */
exports.contextModifier = (pipeline) => (aidData) => {
  // AID bundler gives us no way to execute commands programmatically.
  // I could add one, maybe I will, but for now, we'll just cache some stuff
  // and then restore them after we're done.
  const { text, message, useAI } = aidData;

  if (!useAI) return;

  const { state: { $$configCommanderExec = [] }} = aidData;
  const executedConfigs = new Set($$configCommanderExec);

  const needExec = chain(aidData.worldEntries)
    .filter((wi) => wi.keys === "$Config")
    .filter((wi) => !executedConfigs.has(wi.id))
    .toArray();
  
  if (needExec.length === 0) return;

  /** @type {Map<WorldInfoEntry, string[]>} */
  const configProblems = new Map();

  for (const configEntry of needExec) {
    /** @type {string[]} */
    const cmdProblems = [];
    /** @type {string[]} */
    const cmdMessages = [];

    const commands = configEntry.entry
      .split("\n")
      .filter((line) => line.startsWith(pipeline.commandHandler.commandPrefix));

    for (const commandText of commands) {
      // Reset for the next command.
      aidData.useAI = true;
      aidData.message = "";
      aidData.text = commandText;

      const execCommand = pipeline.commandHandler.checkCommand(aidData);

      if (execCommand == null) {
        cmdProblems.push([
          commandText,
          "  Command not found."
        ].join("\n"));
      }
      else if (aidData.message) {
        cmdMessages.push([
          commandText,
          ...aidData.message
            .split("\n")
            .map((ln) => `  ${ln}`)
        ].join("\n"))
      }
    }

    if (cmdMessages.length > 0) {
      // Report the results of the commands to console.
      const report = [
        `Messages from $Config#${configEntry.id}:\n`,
        ...cmdMessages
      ].join("\n");

      console.log(report);
    }

    // If we had problems executing all the commands, we'll not count it
    // as executed and report the problems so they can be corrected.
    if (cmdProblems.length > 0)
      configProblems.set(configEntry, cmdProblems);
    else
      $$configCommanderExec.push(configEntry.id);
  }

  // Restore the `AIDData` state.
  aidData.text = text;
  aidData.message = message;
  aidData.useAI = useAI;
  // And update our execution state, in case it is new.
  aidData.state.$$configCommanderExec = $$configCommanderExec;

  if (configProblems.size === 0) return;

  // Report problems to user.  There may actually be more problems, but we
  // don't know if a command was executed successfully or not.  The message
  // set by the command may be indicating issues.  We can only really say
  // if the command executed or not.
  for (const [configEntry, cmdProblems] of configProblems) {
    const report = [
      `Problems from $Config#${configEntry.id}:\n`,
      ...cmdProblems
    ].join("\n");

    aidData.message = report;
    aidData.useAI = false;
  }
};

/**
 * 
 * @param {ConfigCommander.ConfigValue} value 
 * @returns {string}
 */
const getValueText = (value) => {
  const theType = typeof value;
  if (theType === "string") return `String<${value}>`;
  if (theType === "number") return `Number<${value}>`;
  if (theType === "boolean") return String(value);
  return "???";
};

/**
 * @param {ConfigCommander.ConfigStore} configStore
 * @returns {Iterable<string>}
 */
const listValues = function* (configStore) {
  for (const namespace of Object.keys(configStore)) {
    for (const key of Object.keys(configStore[namespace])) {
      const value = configStore[namespace][key];
      const valueText = getValueText(value);
      yield `${namespace}.${key} == ${valueText}`;
    }
  }
};

const reTrue = /true/i;
const reFalse = /false/i;

/**
 * @param {"string" | "number" | "boolean"} dataType 
 */
const setHandler = (dataType) =>
  /**
   * @param {AIDData} data 
   * @param {[string, string, string]} args
   * @returns {string}
   */
  (data, [namespace, key, valueStr]) => {
    const value = dew(() => {
      switch (dataType) {
        case "boolean": {
          if (reTrue.test(valueStr)) return true;
          if (reFalse.test(valueStr)) return false;
          break;
        }
        case "number": {
          const numValue = Number.parseFloat(valueStr);
          if (!Number.isNaN(numValue)) return numValue;
          break;
        }
        case "string":
          return valueStr;
      }
      return undefined;
    });

    if (value != null) {
      const store = ConfigNamespace.getOrCreateStore(data, namespace);
      store[key] = value;
      const valueText = getValueText(value);
      return `${namespace}.${key} == ${valueText}`;
    }

    return `Could not set \`${namespace}.${key}\`; unknown value type: ${valueStr}`;
  };

/** @type {Array<PatternCommandEntry>} */
const commandPatterns = [
  // Set for boolean.
  [/^([\w-]+?)\.([\w-]+?) *?= *?(true|false)$/, setHandler("boolean")],
  // Set for decimal numbers.
  [/^([\w-]+?)\.([\w-]+?) *?= *?(\d+(?:\.\d+)?)$/, setHandler("number")],
  // Set for quoted-strings.
  [/^([\w-]+?)\.([\w-]+?) *?= *?"(.+)"$/, setHandler("string")],
  // Set for enums, which are simple strings.
  [/^([\w-]+?)\.([\w-]+?) *?= *?(\w+)$/, setHandler("string")],
  // Get a specific value and report it as a message.
  [/^([\w-]+?)\.([\w-]+?)$/, (data, [namespace, key]) => {
    const store = ConfigNamespace.getStore(data, namespace);
    const value = store[key];
    if (value != null) {
      const valueText = getValueText(value);
      return `${namespace}.${key} == ${valueText}`;
    }
    
    return `The value at \`${namespace}.${key}\` has not yet been defined.`;
  }],
  // Reset a config value to defaults.
  [/^reset ([\w-]+?)\.([\w-]+?)$/, (data, [namespace, key]) => {
    const store = ConfigNamespace.getStore(data, namespace);
    const value = store[key];
    if (value != null) {
      delete store[key];
      return `The value at \`${namespace}.${key}\` has been reset to defaults.`;
    }

    return `The value at \`${namespace}.${key}\` has not yet been set.`;
  }],
  // List all values in the store.
  ["list", (data) => {
    const { state: { $$configCommanderStore = {}} } = data;
    const lines = [...listValues($$configCommanderStore)];
    if (lines.length > 0) {
      return [
        "Current config values:",
        ...lines.map((v) => `  ${v}`)
      ].join("\n");
    }
    else {
      return "No configuration values have yet been defined.";
    }
  }],
  // Default help message.
  [null, () => {
    return [
      "Usage:",
      "  <namespace>.<key> = <true|false> - Sets a value with a boolean.",
      "  <namespace>.<key> = <number> - Sets a value with a number; uses `.` for decimals.",
      "  <namespace>.<key> = <string> - Sets a value with a string; only letters, numbers, and underscore are allowed.",
      "  <namespace>.<key> = \"<string>\" - Sets a value with a long, quoted string; allows any character, including internal double-quotes.",
      "  <namespace>.<key> - Reports the value of a config in a message.",
      "  reset <namespace>.<key> - Resets a value to default.",
      "  list - Report the current values of all config values."
    ].join("\n");
  }]
];

exports.commands = [
  new MatchCommand("config", new Map(commandPatterns))
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 * The `Pipeline` to add to.
 */
 exports.addPlugin = (pipeline) => {
  for (const cmd of exports.commands)
    pipeline.commandHandler.addCommand(cmd);

  pipeline.addPlugin(new Plugin("Config-Commander",
    undefined,
    exports.contextModifier(pipeline)
  ));
};

// Re-export the state-module.
exports.stateModule = stateModule;