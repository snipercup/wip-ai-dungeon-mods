/// <reference path="./state-engine.d.ts" />
const { chain, tuple, fromPairs, partition } = require("../utils");
const { countOccurences, escapeRegExp } = require("../utils");
const { isInclusiveKeyword, isExclusiveKeyword } = require("./StateEngineEntry");

/** @typedef {import("../utils")[]} */

/**
 * Pattern to create a matcher from a keyword.
 * 
 * When `exactMatch` is `false`, the start of the keyword must be matched, so
 * the keyword "key" will match "key" and "keystone", but not "smokey".
 * 
 * This at least gives some allowance for handling common English plurals,
 * like "keys" but is at least more likely to match what you intend.
 * 
 * When `exactMatch` is `true`, the keyword must match exactly.
 * 
 * @param {string} kw
 * @param {boolean} [exactMatch]
 * @returns {string}
 */
const keywordPattern = (kw, exactMatch = false) => {
  if (!exactMatch) return `(?:\\b|^)${escapeRegExp(kw.trim())}`;
  return `(?:\\b|^)${escapeRegExp(kw.trim())}(?:\\b|$)`
};

/**
 * Memoized counting function to speed up regular-expression matching with
 * repeated keywords.  Create one of these whenever keyword counting
 * is expected to be needed.
 * 
 * @returns {(str: string, regex: RegExp) => number}
 */
const memoizedCounter = () => {
  const store = new Map();

  return (str, regex) => {
    const regexKey = regex.source;
    const regexBin = store.get(regexKey) || new Map();
    const storedCount = regexBin.get(str);
    if (typeof storedCount === "number") return storedCount;

    const newCount = countOccurences(str, regex);
    regexBin.set(str, newCount);
    store.set(regexKey, regexBin);
    return newCount;
  };
}

/**
 * The default in case `targetSources` is `null`, only associate with sources
 * that have matchable text.
 * 
 * @type {Set<AssociationTargets>}
 */
const defaultTargets = new Set(["implicitRef", "playerMemory", "history"]);

/** Class that wraps a world info object and provides keyword matching helpers. */
class MatchableEntry {
  /**
   * @param {StateEngineEntry} stateEntry
   * @param {ReturnType<memoizedCounter>} [matchCounter]
   */
  constructor(stateEntry, matchCounter) {
    this.stateEntry = stateEntry;
    this.matchCounter = matchCounter ?? memoizedCounter();

    // Cache the `targetSources` as a `Set`, since it is a getter property.
    const targets = stateEntry.targetSources;
    this.targetSources = targets ? new Set(targets) : defaultTargets;

    // @ts-ignore - TS is stupid with defaults in destructuring.
    // It's still typing correctly, though.
    const { include = [], exclude = [] } = chain(stateEntry.keywords)
      .map((kw) => {
        if (isInclusiveKeyword(kw))
          return tuple("include", new RegExp(keywordPattern(kw.value, kw.exactMatch), "i"));
        if (isExclusiveKeyword(kw))
          return tuple("exclude", new RegExp(keywordPattern(kw.value, kw.exactMatch), "i"));
        throw new Error(`Unknown keyword type: ${kw.type}`);
      })
      .thru((kvps) => partition(kvps))
      .value((kvps) => fromPairs(kvps));

    this.include = include;
    this.exclude = exclude;
  }

  get text() {
    return this.stateEntry.text;
  }

  get entryId() {
    return this.stateEntry.entryId;
  }

  get type() {
    return this.stateEntry.type;
  }
  
  /**
   * @param {string | string[]} textOrArr 
   * @param {"included" | "excluded"} mode
   * @returns {number}
   */
  occurancesIn(textOrArr, mode = "included") {
    const keywords = mode === "included" ? this.include : this.exclude;
    if (keywords.length === 0 || !textOrArr) return 0;
    const textArr = typeof textOrArr === "string" ? [textOrArr] : textOrArr;
    let count = 0;
    for (const text of textArr)
      if (text) for (const keyword of keywords)
        count += this.matchCounter(text, keyword);
    return count;
  }

  /**
   * @param {string | string[]} textOrArr 
   * @param {"included" | "excluded"} mode
   * @returns {number}
   */
  uniqueOccurancesIn(textOrArr, mode = "included") {
    const keywords = mode === "included" ? this.include : this.exclude;
    if (keywords.length === 0 || !textOrArr) return 0;
    const textArr = typeof textOrArr === "string" ? [textOrArr] : textOrArr;
    let count = 0;
    for (const text of textArr)
      if (text) for (const keyword of keywords)
        if (this.matchCounter(text, keyword) > 0)
          count += 1;
    return count;
  }

  /**
   * @param {string | string[]} textOrArr
   * @returns {boolean}
   */
  hasIncludedWords(textOrArr) {
    if (!textOrArr) return false;
    // If it lacks include keywords, it matches by default.
    if (this.include.length === 0) return true;

    const textArr = typeof textOrArr === "string" ? [textOrArr] : textOrArr;
    for (const text of textArr)
      if (text) for (const keyword of this.include)
        if (this.matchCounter(text, keyword) > 0) return true;
    return false;
  }

  /**
   * @param {string | string[]} textOrArr
   * @returns {boolean}
   */
  hasExcludedWords(textOrArr) {
    if (this.exclude.length === 0 || !textOrArr) return false;
    const textArr = typeof textOrArr === "string" ? [textOrArr] : textOrArr;
    for (const text of textArr)
      if (text) for (const keyword of this.exclude)
        if (this.matchCounter(text, keyword) > 0) return true;
    return false;
  }
}

exports.MatchableEntry = MatchableEntry;
exports.memoizedCounter = memoizedCounter;