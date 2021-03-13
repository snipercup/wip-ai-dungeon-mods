/// <reference path="../state-engine/state-engine.d.ts" />
const { addStateEntry } = require("../state-engine/core");

/**
 * A simple state entry type for the vanilla world info, for backward compatibility
 * with the standard system.
 */

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
 const init = (data) => {
  addStateEntry("VanillaEntry", {
    /** @type {StateAssociationBaseFn} */
    associator(matcher, source) {
      // Only applies to history entries.
      if (typeof source !== "number") return false;
      // Will use all standard stuff, besides this.
      return undefined;
    }
  });
};

/** @type {StateModule} */
module.exports.stateModule = {
  pre: [init]
};