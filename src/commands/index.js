/// <reference path="./commands.d.ts" />
const { Command } = require("aid-bundler");

class SimpleCommand extends Command {
  /**
   * 
   * @param {string} name 
   * @param {SimpleCommandHandler} handler 
   */
  constructor(name, handler) {
    /** @type {import("aid-bundler/src/commandHandler").CommandHandlerFn} */
    const fixedHandler = (data, args) => {
      const message = handler(data, args);
      if (message) data.message = message;
      else data.message = "";
    };

    super(name, fixedHandler);
  }
}

module.exports.SimpleCommand = SimpleCommand;