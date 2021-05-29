/// <reference path="../state-engine.d.ts" />
const { tuple } = require("../../utils");
const { isParamsFor } = require("../utils");
const { addStateEntry } = require("../registry");
const { isRelation } = require("../StateEngineEntry");
const { EngineEntryForWorldInfo } = require("../EngineEntryForWorldInfo");

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
 const init = () => {
  /**
   * A state entry to assist in creating classifications of things.  You can provide
   * a list of matchers and then relate other entries to this entry's key in order
   * to share keywords or relations.
   * 
   * The text of this entry is not used and it will only search relations for the
   * immediate entry only.
   */
  class ClassificationEntry extends EngineEntryForWorldInfo {
    static get forType() { return "Class"; }
    get targetSources() { return tuple("implicitRef", "playerMemory", "history"); }

    validator() {
      const issues = super.validator();
      if (this.keys.size !== 1)
        issues.push(`World info entry \`${this.infoKey}\` must have exactly one tag.`);
      if (this.relations.length === 0 && this.keywords.length === 0)
        issues.push(`World info entry \`${this.infoKey}\` requires at least one matcher.`);
      return issues;
    }

    /**
     * A `$Class` entry only searches the immediate entry for relations.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationParamsFor<this>} params
     * @returns {boolean}
     * Whether this entry's relations were satisfied for this source.
     */
     checkRelations(matcher, params) {
      if (!isParamsFor("history", params)) return false;
      const { source, usedKeys } = params;

      if (this.relations.length === 0) return true;
      const result = this.relator.check(usedKeys, source, source);
      return result !== false;
    }

    /**
     * This entry will never actually be used for its text.
     * 
     * @returns {number}
     */
    valuator() {
      return 0;
    }

    /**
     * This entry will never actually be used for its text.
     * 
     * @returns {false}
     */
    postRules() {
      return false;
    }
  }

  addStateEntry(ClassificationEntry);
};

/** @type {StateModule} */
exports.stateModule = {
  pre: [init]
};