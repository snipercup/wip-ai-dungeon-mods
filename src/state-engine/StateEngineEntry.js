const { entryCount } = require("./config");
const { dew, tuple2, getText } = require("../utils");
const { isParamsFor, isParamsTextable } = require("../state-engine/utils");
const { MatchableEntry } = require("./MatchableEntry");

/** Common regular expressions for parsing state entry definitions. */
module.exports.regex = {
  /**
   * Parses an info entry into its type and the info declaration:
   * - "$Location" => `["Location", undefined]`
   * - "$Player[Ike]" => `["Player", "[Ike]"]`
   * - "$Lore[Temple]" => `["Lore", "[Temple]"]`
   * - "$Lore[Temple: Ike & Marth]" => `["Lore", "[Temple: Ike & Marth]"]`
   * - "$Lore[Temple](temple; ancient)" => `["Lore", "[Temple](temple; ancient)"]`
   * - "$State(weapon; sword)" => `["State", "(weapon; sword)"]`
   */
  infoEntry: /^\$(\w+?)((?:\[|\().*)?$/,
  /**
   * Parses an info declaration into its full-key and keyword parts:
   * - "[Ike]" => `["Ike", undefined]`
   * - "[Temple]" => `["Temple", undefined]`
   * - "[Temple: Ike & Marth]" => `["Temple: Ike & Marth", undefined]`
   * - "[Temple](temple; ancient)" => `["Temple", "temple; ancient"]`
   * - "(weapon; sword)" => `[undefined, "weapon; sword"]`
   */
  infoDeclaration: /^(?:\[(.*?)\])?(?:\((.+?)\))?$/,
  /**
   * Parses a full-key into its key and its related-keys parts:
   * - "Ike" => `["Ike", undefined]`
   * - "Temple" => `["Temple", undefined]`
   * - "Temple: Ike & Marth" => `["Temple", "Ike & Marth"]`
   */
  infoFullKey: /^(\w+?)(?::\s*?(.*))?$/,
  /**
   * Parses a keyword part:
   * - "()" => `[undefined]`
   * - "(temple; ancient)" => `["temple; ancient"]`
   */
  infoKeywords: /^\((.*)?\)$/,
  /** Matches keywords intended for inclusion matching; accepts an optional leading "+". */
  includedKeyword: /^\+?([\w ]+)$/,
  /** Matches keywords intended for exclusion matching; requires a leading "-". */
  excludedKeyword: /^-([\w ]+)$/
};

/**
 * Extracts the type for a `StateEngineEntry` from a `WorldInfoEntry`.
 * 
 * @param {WorldInfoEntry} worldInfo
 * @returns {string | undefined}
 */
module.exports.extractType = (worldInfo) => {
  // @ts-ignore - TS too dumb with `??` and `[]`.
  const [, type] = module.exports.regex.infoEntry.exec(worldInfo.keys) ?? [];
  return type;
};

/**
 * Matches the given keywords using the given regular expression.  If it fails
 * to match, the keyword is filtered from the result..
 * 
 * @param {string[]} keywords 
 * @param {RegExp} reMatcher
 * @returns {string[]}
 */
module.exports.parseKeywords = (keywords, reMatcher) => {
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
 * The default World Info parser for a standard State Entry.
 * 
 * @param {WorldInfoEntry["id"]} infoId
 * @param {WorldInfoEntry["keys"]} infoKey
 * @returns {StateEngineData | undefined}
 */
module.exports.infoKeyParserImpl = (infoId, infoKey) => {
  const {
    infoEntry, infoDeclaration, infoFullKey,
    includedKeyword, excludedKeyword
  } = module.exports.regex;

  const [, type, dec] = infoEntry.exec(infoKey) ?? [];
  if (!type) return undefined;

  const [, fullKey, keywordPart] = infoDeclaration.exec(dec) ?? [];
  // Full-key part parsing.
  // @ts-ignore - TS too dumb with `??` and `[]`.
  const [, key = null, relationPart] = (fullKey && infoFullKey.exec(fullKey)) ?? [];
  const relations = relationPart?.split("&").map(s => s.trim()).filter(Boolean) ?? [];
  // Keyword part parsing.
  const keywords = keywordPart?.split(";").map(s => s.trim()).filter(Boolean) ?? [];
  const include = module.exports.parseKeywords(keywords, includedKeyword);
  const exclude = module.exports.parseKeywords(keywords, excludedKeyword);

  return { infoId, infoKey, type, key, relations, include, exclude };
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
module.exports.iterUsedKeys = function*(usedKeys, start, end = entryCount) {
  // Make sure we don't go beyond the available history.
  end = Math.min(end, entryCount);
  let index = Math.max(start, 0);
  while(index <= end) {
    const theKeys = usedKeys.get(index++);
    if (theKeys) yield* theKeys;
  }
}

/**
 * Checks the `text` against the keywords of the given `matcher`.
 * 
 * @param {MatchableEntry} matcher
 * @param {string} text
 */
module.exports.checkKeywords = (matcher, text) => {
  if (!text) return false;
  if (matcher.hasExcludedWords(text)) return false;
  if (!matcher.hasIncludedWords(text)) return false;
  return true;
};

class BadStateEntryError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);

    // @ts-ignore
    Error.captureStackTrace?.(this, CustomError);
    this.name = this.constructor.name;
  }
}

class StateEngineEntry {
  /**
   * @param {WorldInfoEntry} worldInfo
   */
  constructor(worldInfo) {
    this.worldInfo = worldInfo;
    const parsedResult = this.parse(worldInfo);

    this.infoId = parsedResult.infoId;
    this.infoKey = parsedResult.infoKey;
    this.key = parsedResult.key;
    this.relations = new Set(parsedResult.relations);
    this.include = new Set(parsedResult.include);
    this.exclude = new Set(parsedResult.exclude);
  }

  /**
   * The type for this kind of entry.  Must be overridden by children.
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
   * The type of this instance.
   * 
   * @type {string}
   */
  get type() {
    // @ts-ignore
    return this.constructor.forType;
  }

  /**
   * The associated text of this entry.
   * 
   * @type {string}
   */
  get text() {
    return this.worldInfo.entry;
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
   * Transforms a `WorldInfoEntry` into a `WorldStateData` object by parsing its
   * `keys` property.  If it fails, it will return `null`.
   * 
   * @param {WorldInfoEntry} worldInfo 
   * @throws If parsing failed.
   * @throws If parsing succeeded, but the extracted type did not match.
   * @returns {StateEngineData}
   */
  parse(worldInfo) {
    const { id, keys } = worldInfo;
    if (keys.indexOf(",") !== -1)
      throw new BadStateEntryError([
        "The World Info entry's keys contain a comma.",
        "Keywords should be separated by a semi-colon (;), instead."
      ].join("  "));

    const parsedResult = module.exports.infoKeyParserImpl(id, keys);
    if (!parsedResult)
      throw new BadStateEntryError(
        `Failed to parse World Info entry as a \`${this.type}\`.`
      );
    if (parsedResult.type !== this.type)
      throw new BadStateEntryError([
        `Expected World Info entry to parse as a \`${this.type}\``,
        `but it parsed as a \`${parsedResult.type}\` instead.`
      ].join(", "));

    return parsedResult;
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
   * @param {AssociationParams} params
   * @returns {boolean}
   * Whether this entry should be associated with this source.
   */
  associator(matcher, params) {
    // Default associator does not do implicit reference associations.
    if (isParamsFor("implicitRef", params)) return false;

    // The default associator requires text to do any form of matching.
    if (!isParamsTextable(params)) return false;
    const text = getText(params.entry).trim();

    // Check keywords.
    if (!module.exports.checkKeywords(matcher, text)) return false; 

    // We're done if we can't process relations.
    if (!isParamsFor("history", params)) return true;
    const { source, usedKeys } = params;

    // The default associator looks at the entire history up to this point
    // for matching references.
    const validForRelations = dew(() => {
      if (this.relations.size === 0) return true;
      const allUsedKeys = new Set(module.exports.iterUsedKeys(usedKeys, source));
      for (const key of this.relations)
        if (!allUsedKeys.has(key)) return false;
      return true;
    });
    if (!validForRelations) return false;

    // Record this key's usage, if needed.
    if (!this.key) return true;

    const theKeys = usedKeys.get(source) ?? new Set();
    theKeys.add(this.key);
    usedKeys.set(source, theKeys);
    return true;
  }

  /**
   * Allows an entry to check the state of the associations after they have been
   * completed, but before scoring them.  This provides an opportunity to discard
   * entries strategically, based on the scores and kinds of associations matched
   * to particular sources.
   * 
   * Use `neighbors` to explore the other associations.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSources} source
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
   * @param {AssociationSources} source
   * @param {StateEngineEntry | HistoryEntry | string} entry
   * @param {number} [baseScalar]
   * @returns {number}
   */
  valuator(matcher, source, entry, baseScalar = 1) {
    if (baseScalar === 0) return 0;

    const text = getText(entry);
    const inclusiveCount = this.include.size;
    const exclusiveCount = this.exclude.size;
    const penaltyRatio = tuple2(1, text && exclusiveCount > 0 ? 1 : 2);

    const [totalMatched, uniqueMatched] = dew(() => {
      if (inclusiveCount === 0) return penaltyRatio;
      if (!text) return penaltyRatio;
      const totalMatched = matcher.occurancesIn(text);
      if (totalMatched === 0) return penaltyRatio;
      const uniqueMatched = matcher.uniqueOccurancesIn(text);
      return [totalMatched, uniqueMatched];
    });

    const keywordScalar = 10 * Math.pow(1.1, exclusiveCount);
    const keywordPart = totalMatched / uniqueMatched;
    const relationsPart = this.relations.size + 1;

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
   * These are the final output buckets:
   * - `forContextMemory` can have multiple entries, but only one of each type.
   * - `forHistory` can have only one entry per history offset.
   * - `forFrontMemory` can only have one entry.
   * - `forAuthorsNote` can only have one entry.
   * 
   * If this returns `true`, and the target can only have one entry, this entry
   * will be the ultimate selection for that target.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSources} source
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
    return new MatchableEntry(this, matchCounter);
  }

  /**
   * Serializes a `StateEngineEntry` into a `StateEngineData`.
   * 
   * @returns {StateEngineData}
   */
  toJSON() {
    const { infoId, infoKey, type, key } = this;
    const relations = [...this.relations];
    const include = [...this.include];
    const exclude = [...this.exclude];
    return { infoId, infoKey, type, key, relations, include, exclude };
  }
}

module.exports.StateEngineEntry = StateEngineEntry;
module.exports.BadStateEntryError = BadStateEntryError;