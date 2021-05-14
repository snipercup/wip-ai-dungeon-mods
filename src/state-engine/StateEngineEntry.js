const { entryCount } = require("./config");
const { dew, tuple2, getText } = require("../utils");
const { isParamsFor, isParamsTextable, stateDataString } = require("./utils");

/**
 * @param {any} value
 * @param {string} type
 * @returns {boolean}
 */
const hasTypeOf = (value, type) => "type" in value && value.type === type;
const relationTypes = new Set(["allOf", "atLeastOne", "negated"]);

/** @type {(value: AnyMatcherDef) => value is KeywordDef<"include">} */
exports.isInclusiveKeyword = (value) => hasTypeOf(value, "include");
/** @type {(value: AnyMatcherDef) => value is KeywordDef<"exclude">} */
exports.isExclusiveKeyword = (value) => hasTypeOf(value, "exclude");
/** @type {(value: AnyMatcherDef) => value is AnyKeywordDef} */
exports.isKeyword = (value) => exports.isInclusiveKeyword(value) || exports.isExclusiveKeyword(value);
/** @type {(value: AnyMatcherDef) => value is AnyRelationDef} */
exports.isRelation = (value) => "type" in value && relationTypes.has(value.type);
/** @type {<TType extends RelationTypes>(value: AnyMatcherDef, type: TType) => value is RelationDef<TType>} */
exports.isRelationOfType = (value, type) => hasTypeOf(value, type);

const reExactMatch = /^"([\w ]+)"$/;
const reInclusiveKeyword = /^\+?(["\w ]+)$/;
const reExclusiveKeyword = /^-(["\w ]+)$/;
const reRelation = /^([:!?])([\w]+)$/;

/** Common parsers for parsing state entry definitions. */
exports.parsers = {
  /**
   * Matches keywords intended for inclusion matching; accepts an optional prefixed "+".
   * 
   * @type {PatternMatcher<KeywordDef<"include">>}
   */
  includedKeyword: (text) => {
    if (!text) return undefined;
    const kwMatch = reInclusiveKeyword.exec(text);
    if (!kwMatch) return undefined;
    const exMatch = reExactMatch.exec(kwMatch[1]);
    if (exMatch) return { type: "include", exactMatch: true, value: exMatch[1] };
    return { type: "include", exactMatch: false, value: kwMatch[1] };
  },
  /**
   * Matches keywords intended for exclusion matching; requires a prefixed "-".
   * 
   * @type {PatternMatcher<KeywordDef<"exclude">>}
   */
  excludedKeyword: (text) => {
    if (!text) return undefined;
    const kwMatch = reExclusiveKeyword.exec(text);
    if (!kwMatch) return undefined;
    const exMatch = reExactMatch.exec(kwMatch[1]);
    if (exMatch) return { type: "exclude", exactMatch: true, value: exMatch[1] };
    return { type: "exclude", exactMatch: false, value: kwMatch[1] };
  },
  /**
   * Matches the relation patterns.  Requires a special prefix:
   * - `:` - An "all of" relation.
   * - `?` - An "at least one" relation.
   * - `!` - A "negated" relation.
   * 
   * @type {PatternMatcher<AnyRelationDef>}
   */
  relation: (text) => {
    if (!text) return undefined;
    const match = reRelation.exec(text);
    if (!match) return undefined;
    const [, typePart, key] = match;
    switch (typePart) {
      case ":": return { type: "allOf", key };
      case "?": return { type: "atLeastOne", key };
      case "!": return { type: "negated", key }
    }
  }
};

/**
 * Matches the given keywords using the given regular expression.  If it fails
 * to match, the keyword is filtered from the result..
 * 
 * @param {string[]} keywords 
 * @param {RegExp} reMatcher
 * @returns {string[]}
 */
exports.parseKeywords = (keywords, reMatcher) => {
  /** @type {string[]} */
  const matches = [];
  if (!keywords || !keywords.length) return matches;

  for (const rootKeyword of keywords) {
    const match = reMatcher.exec(rootKeyword);
    if (!match) continue;
    const keyword = match[1].trim();
    if (keyword) matches.push(keyword);
  }

  return matches;
};

/**
 * Iterates a `usedKeys` map across a range of entries.
 * Bear in mind that the `start` and `end` are offsets from the latest
 * `history` entry into the past.
 * 
 * So, `0` is the just-now inputted text from the player, and `1` is
 * the last entry in `history`, and `2` is the the next oldest `history`
 * entry, and so on.
 * 
 * @param {UsedKeysMap} usedKeys
 * @param {number} start
 * @param {number} [end]
 * @returns {Iterable<string>}
 */
exports.iterUsedKeys = function*(usedKeys, start, end = entryCount) {
  // Make sure we don't go beyond the available history.
  end = Math.min(end, entryCount);
  let index = Math.max(start, 0);
  while(index <= end) {
    const theKeys = usedKeys.get(index++);
    if (theKeys) yield* theKeys;
  }
}

/**
 * Error for general errors involving `StateEngineEntry`.
 */
class BadStateEntryError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);

    // @ts-ignore - That's why we're checking, TS.
    Error.captureStackTrace?.(this, this.constructor);
    this.name = this.constructor.name;
  }
}

/**
 * More specific error involving type mismatches while generating
 * `StateEngineEntry` instances.
 */
class InvalidTypeError extends BadStateEntryError {}

class StateEngineEntry {

  constructor() {
    /** The entry's ID. */
    this.entryId = "";
    /** @type {Set<string>} All keys assigned to the entry. */
    this.keys = new Set();
    /** @type {AnyRelationDef[]} The entry's relations to other keys. */
    this.relations = [];
    /** @type {AnyKeywordDef[]} The entry's keywords, for text matching. */
    this.keywords = [];
    /** A helper for checking relations against keys in the `UsedEntryMap`. */
    this.relator = require("./RelatableEntry").nilRelatableEntry;
    /** @type {Map<AssociationSources, number>} Storage for relations found per source. */
    this.relationCounts = new Map();
  }

  /**
   * The type for this kind of entry.
   * 
   * Must be overridden by child classes.
   * 
   * @type {string}
   */
  static get forType() {
    throw new TypeError([
      "Override me with a type string.",
      "IE: if I'm for `$Lore`, make me return `\"Lore\"`."
    ].join("  "));
  }

  /**
   * Given the `AIDData` object, returns an iterable of `StateEngineEntry`
   * instances that could be built for this class.
   * 
   * Must be overridden by child classes.
   * 
   * @param {AIDData} data
   * @param {Map<string, string[]>} issuesMap
   * @returns {Iterable<StateEngineEntry>}
   */
  static produceEntries(data, issuesMap) {
    throw new TypeError("Override me so I produce entries of this type.");
  }

  /**
   * The type of this instance.
   * 
   * @type {string}
   */
  get type() {
    // @ts-ignore
    return this.constructor.forType;
  }

  /**
   * The associated text of this entry.  Defaults to an empty-string.
   * 
   * @type {string}
   */
  get text() {
    return "";
  }

  /**
   * The specific association sources that this entry can match.
   * - Return `null` to match all sources with text, which is `implicitRef`,
   *   `playerMemory`, and `history`.  This is the default behavior.
   * - Returning `[]` will match no sources, making the entry useless.
   * 
   * Specifying this can speed up processing by skipping entries that have
   * no interest in certain sources.
   * 
   * @type {AssociationTargets[] | null}
   */
  get targetSources() {
    return null;
  }

  /**
   * The priority of this entry.  Priority affects how entries will be sorted
   * in the final text delivered to the AI.  Higher priority means it will
   * tend to appear earlier in the output.
   * 
   * @type {number | undefined}
   */
  get priority() {
    return undefined;
  }

  /**
   * Handles deferred initialization of the class.
   * 
   * @param {string} entryId
   * @param {string[]} [keys]
   * @param {Object} [matchingOpts]
   * @param {AnyRelationDef[]} [matchingOpts.relations]
   * @param {AnyKeywordDef[]} [matchingOpts.keywords]
   * @returns {this}
   */
  init(entryId, keys, matchingOpts) {
    const { RelatableEntry } = require("./RelatableEntry");
    this.entryId = entryId;
    this.keys = new Set(keys ?? []);
    this.relations = matchingOpts?.relations ?? [];
    this.keywords = matchingOpts?.keywords ?? [];
    this.relator = new RelatableEntry(this.relations);
    return this;
  }

  /**
   * Validation function for the entry.  Allows you to report issues with the data
   * that was parsed.  If a non-empty array is returned, State Engine will block
   * the current turn from continuing until the issue is resolved.
   * 
   * If your state entry doesn't support keywords, you can provide this issue as
   * a string in the returned array and it will be reported to the player.
   * 
   * By default, no validation issues are provided.
   * 
   * @returns {string[]}
   */
  validator() {
    return [];
  }

  /**
   * After all entries have been built and validated, this method allows you to
   * tweak the information of this entry based on how other entries are configured.
   * 
   * The map received as `allStates` contains POJO copies of other states immediately
   * after validation.  Altering them does not affect the actual `StateEngineEntry`
   * instance they came from.
   * 
   * @param {Map<string, StateDataForModifier>} allStates
   * @returns {void}
   */
  modifier(allStates) {
    return;
  }

  /**
   * Checks if a state entry should be associated with a source of information.
   * 
   * Use `params.source` to determine the information being matched:
   * - `"implicit"` - No text to match on, but if associated, the entry will just be
   *   included.  Only one entry of each time will ultimately be selected.
   * - `"implicitRef"` - Allows entries to match other entries that were associated
   *   implicitly.  This allows you to have recursive matches, where entries can
   *   elaborate on other entries.
   * - `"playerMemory"` - Provides the current player memory for matching.
   * - `"authorsNote"` - No text to match on, but if associated and selected, this
   *   entry will be placed into `state.memory.authorsNote`.
   * - `"frontMemory"` - No text to match on, but if associated and selected, this
   *   entry will be placed into `state.memory.frontMemory`.
   * - `"number"` - Provides a history entry for matching.  The value is the offset
   *   from the latest history entry, so `0` is the text just provided by the player,
   *   `1` is the last element of the `history` array, etc.
   * 
   * The `matcher` instance provides helpers to efficiently match keywords to text.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationParamsFor<this>} params
   * @returns {boolean}
   * Whether this entry should be associated with this source.
   */
  associator(matcher, params) {
    // The default associator requires text to do any form of matching.
    if (!isParamsTextable(params)) return false;

    if (!this.checkKeywords(matcher, params)) return false;
    if (!this.checkRelations(matcher, params)) return false;

    this.recordKeyUsage(params);
    return true;
  }

  /**
   * A helper method that checks if the entry's keywords are matched in the text.
   * 
   * Returns `true` when:
   * - This entry has no keywords that could or could not be matched.
   * - The source has text and at least one inclusive and zero exclusive keywords
   *   were matched.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationParamsFor<this>} params
   * @returns {boolean}
   * Whether this entry's relations were satisfied for this source.
   */
  checkKeywords(matcher, params) {
    const hasKeywords = (matcher.include.length + matcher.exclude.length) > 0;
    // Pass it by default if it has no keywords to match.
    if (!hasKeywords) return true;
    // If this source has no text, we fail the match.
    if (!isParamsTextable(params)) return false;
    
    // @ts-ignore - Not sure why this isn't being narrowed.  TS dumb as shit.
    const text = getText(params.entry).trim();
    if (!text) return false;
    if (matcher.hasExcludedWords(text)) return false;
    if (!matcher.hasIncludedWords(text)) return false;
    return true;
  }

  /**
   * A helper method that checks if this entry's relations are referenced in other
   * entries.
   * 
   * Returns `true` when:
   * - This source is not `"history"`.
   * - It doesn't have any relations to check for.
   * - The entry's relations are satisfied.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationParamsFor<this>} params
   * @returns {boolean}
   * Whether this entry's relations were satisfied for this source.
   */
  checkRelations(matcher, params) {
    if (!isParamsFor("history", params)) return true;
    const { source, usedKeys } = params;

    if (this.relations.length === 0) return true;
    const allUsedKeys = new Set(exports.iterUsedKeys(usedKeys, source));
    const result = this.relator.check(allUsedKeys);
    if (result === false) return false;
    this.relationCounts.set(source, result);
    return true;
  }

  /**
   * Handles the recording of the entry's key in `usedKeys` for history sources.
   * This is safe to call, even if the source is not for the history.
   * 
   * @param {AssociationParamsFor<this>} params 
   * @returns {void}
   */
  recordKeyUsage(params) {
    if (this.keys.size === 0) return;
    if (!isParamsFor("history", params)) return;

    const { source, usedKeys } = params;
    const theKeys = usedKeys.get(source) ?? new Set();
    for (const key of this.keys) theKeys.add(key);
    usedKeys.set(source, theKeys);
  }

  /**
   * Allows an entry to check the state of the associations after they have been
   * completed, but before scoring them.  This provides an opportunity to discard
   * entries strategically, based on the scores and kinds of associations matched
   * to particular sources.
   * 
   * Use `neighbors` to explore the other associations.
   * 
   * Pre-rules are run in the order of:
   * - The `implicit` source.
   * - The `playerMemory` source.
   * - The `authorsNote` source.
   * - The `frontMemory` source.
   * - The `implicitRef` source.
   * - The history, in temporal order, so `20, 19, 18, ...` and so on to `0`.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {PreRuleIterators} neighbors
   * @returns {boolean}
   * Whether this entry's association should be retained.
   */
  preRules(matcher, source, neighbors) {
    return true;
  }

  /**
   * Allows an entry to calculate its score.
   * 
   * The score is calculated based on:
   * - A base scalar (`1` by default).
   * - The total inclusive keywords matched versus unique inclusive keywords matched.
   *   Assumes a 1-to-2 ratio if the entry has no keywords or was associated without
   *   them, effectively penalizing the entry for not being matched through text.
   * - The number of exclusive keywords dodged.
   * - The number of related keys that had to match for this to match.
   * 
   * When overriding, if you only want to provide a boost to the base scalar, simply
   * call `super.valuator` and pass an argument for `baseScalar`.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {StateEngineEntry | HistoryEntry | string} entry
   * @param {number} [baseScalar]
   * @returns {number}
   */
  valuator(matcher, source, entry, baseScalar = 1) {
    if (baseScalar === 0) return 0;

    const text = getText(entry);
    const inclusiveCount = matcher.include.length;
    const exclusiveCount = matcher.exclude.length;
    const penaltyRatio = tuple2(1, text && exclusiveCount > 0 ? 1 : 2);

    const [totalMatched, uniqueMatched] = dew(() => {
      if (inclusiveCount === 0) return penaltyRatio;
      if (!text) return penaltyRatio;
      const totalMatched = matcher.occurrencesIn(text);
      if (totalMatched === 0) return penaltyRatio;
      const uniqueMatched = matcher.uniqueOccurrencesIn(text);
      return [totalMatched, uniqueMatched];
    });

    const keywordScalar = 10 * Math.pow(1.1, exclusiveCount);
    const keywordPart = totalMatched / uniqueMatched;
    const relationsPart = (this.relationCounts.get(source) ?? 0) + 1;

    return baseScalar * keywordPart * keywordScalar * relationsPart;
  }

  /**
   * Allows an entry to check the state of the associations after all entries
   * have been given a score.  This provides an opportunity to discard entries
   * strategically, based on the scores and kinds of associations matched to
   * particular sources.
   * 
   * Use `neighbors` to explore the other associations.
   * 
   * Post-rules are run in the order of:
   * - The history, temporaly reversed order, so `0, 1, 2, ...` and so on.
   * - The `implicitRef` source.
   * - The `frontMemory` source.
   * - The `authorsNote` source.
   * - The `playerMemory` source.
   * - The `implicit` source.
   * 
   * These are the final output buckets:
   * - `forContextMemory` can have multiple entries, but only one of each type.
   *   Selected associations from the `implicit`, `implicitRef`, and `playerMemory`
   *   sources end up here.
   * - `forHistory` can have only one entry per history source.
   * - `forFrontMemory` can only have one entry from the `frontMemory` source.
   * - `forAuthorsNote` can only have one entry from the `authorsNote` source.
   * 
   * If this returns `true`, and the target can only have one entry, this entry
   * will be the ultimate selection for that target.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {number} score
   * @param {PostRuleIterators} neighbors
   * @returns {boolean}
   * Whether this entry's association should be retained.
   */
  postRules(matcher, source, score, neighbors) {
    return true;
  }

  /**
   * Builds a `MatchableEntry` from this instance.
   * 
   * @param {ReturnType<import("./MatchableEntry").memoizedCounter>} [matchCounter]
   * @returns {MatchableEntry}
   */
  toMatchable(matchCounter) {
    const { MatchableEntry } = require("./MatchableEntry");
    return new MatchableEntry(this, matchCounter);
  }

  /**
   * Converts this instance into a string.
   * 
   * @param {boolean} [withExcerpt]
   * @returns {string}
   */
  toString(withExcerpt) {
    const { type, entryId, text: entryText } = this;
    const keys = [...this.keys];
    if (!withExcerpt) return stateDataString({ type, entryId, keys });
    return stateDataString({ type, entryId, keys, entryText });
  }

  /**
   * Serializes a `StateEngineEntry` into a `StateEngineData`.
   * 
   * @returns {StateEngineData}
   */
  toJSON() {
    const { type, entryId } = this;
    const keys = [...this.keys];
    const relations = [...this.relations];
    const keywords = [...this.keywords];
    return { type, entryId, keys, relations, keywords };
  }
}

exports.StateEngineEntry = StateEngineEntry;
exports.BadStateEntryError = BadStateEntryError;
exports.InvalidTypeError = InvalidTypeError;