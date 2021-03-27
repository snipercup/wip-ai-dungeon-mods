/// <reference path="./commands.d.ts" />
const { dew, escapeRegExp } = require("../utils");
const { Command } = require("aid-bundler");

/**
 * A simple command that allows you to return a string, which is set as the message.
 */
class SimpleCommand extends Command {
  /**
   * @param {string} name 
   * @param {SimpleCommandHandler} handler 
   */
  constructor(name, handler) {
    /** @type {import("aid-bundler/src/commandHandler").CommandHandlerFn} */
    const fixedHandler = (data, args) => {
      const message = handler(data, args);
      data.message = message ? message : "";
    };

    super(name, fixedHandler);
  }
}

/**
 * A command that matches a pattern of arguments.
 */
class MatchCommand extends Command {
  /**
   * @param {string} name 
   * @param {PatternCommandHandlers} patterns
   */
  constructor(name, patterns) {
    /** @type {Map<RegExp, SimpleCommandHandler>} */
    const patternMap = dew(() => {
      /** @type {Map<RegExp, SimpleCommandHandler>} */
      const patternMap = new Map();

      if (patterns instanceof Map) {
        for (const [pattern, handler] of patterns) {
          const regex
            // The `null` value is for the default pattern.
            = pattern == null ? /.*/
            : pattern instanceof RegExp ? pattern
            : new RegExp(`^${escapeRegExp(pattern)}$`, "i");
          patternMap.set(regex, handler);
        }
      }
      else {
        for (const pattern of Object.keys(patterns)) {
          const regexPattern = `^${escapeRegExp(pattern)}$`;
          patternMap.set(new RegExp(regexPattern, "i"), patterns[pattern]);
        }
      }

      return patternMap;
    });

    /** @type {import("aid-bundler/src/commandHandler").CommandHandlerFn} */
    const innerHandler = (data, args) => {
      const needle = args.join(" ");
      for (const [regex, handler] of patternMap) {
        if (!regex.test(needle)) continue;
        const message = handler(data, args);
        data.message = message ? message : "";
        return;
      }

      data.message = `No match for arguments: ${needle}`;
    };

    super(name, innerHandler);
  }
}

module.exports.SimpleCommand = SimpleCommand;
module.exports.MatchCommand = MatchCommand;