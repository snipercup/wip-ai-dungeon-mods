const { dew } = require("../utils");
const { worldInfoString } = require("./utils");
const { StateEngineEntry, BadStateEntryError, InvalidTypeError } = require("./StateEngineEntry");
const { parseKeywords, regex: baseRegex } = require("./StateEngineEntry");

exports.regex = {
  ...baseRegex,
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
   * Parses a relation set, only.  It must contain `&`.
   * - "Ike & Marth" => `[undefined, "Ike & Marth"]`
   * - "Ike & Marth & Lucina" => `[undefined, "Ike & Marth & Lucina"]`
   * 
   * Used as a fallback if `infoFullKey` fails to match anything.
   */
  infoRelOnly: /^()((?:\w+(?: *& *)?)*)$/,
  /**
   * Parses a keyword part:
   * - "()" => `[undefined]`
   * - "(temple; ancient)" => `["temple; ancient"]`
   */
  infoKeywords: /^\((.*)?\)$/
};

/**
 * Extracts the type for a `StateEngineEntry` from a `WorldInfoEntry`.
 * 
 * @param {WorldInfoEntry} worldInfo
 * @returns {string | undefined}
 */
exports.extractType = (worldInfo) => {
  // @ts-ignore - TS too dumb with `??` and `[]`.
  const [, type] = exports.regex.infoEntry.exec(worldInfo.keys) ?? [];
  return type;
};

/**
 * The default World Info parser for a standard State Entry.
 * 
 * @param {WorldInfoEntry["keys"]} infoKey
 * @returns {Omit<StateEngineData, "entryId"> | undefined}
 */
 exports.infoKeyParserImpl = (infoKey) => {
  const {
    infoEntry, infoDeclaration, infoFullKey, infoRelOnly,
    includedKeyword, excludedKeyword
  } = exports.regex;

  const [, type, dec] = infoEntry.exec(infoKey) ?? [];
  if (!type) return undefined;

  const [, fullKey, keywordPart] = infoDeclaration.exec(dec) ?? [];
  // Full-key part parsing.
  // @ts-ignore - TS too dumb with `??` and `[]`.
  const [, key = null, relationPart] = dew(() => {
    if (!fullKey) return [];
    return infoFullKey.exec(fullKey) ?? infoRelOnly.exec(fullKey) ?? [];
  });
  const relations = relationPart?.split("&").map(s => s.trim()).filter(Boolean) ?? [];
  // Keyword part parsing.
  const keywords = keywordPart?.split(";").map(s => s.trim()).filter(Boolean) ?? [];
  const include = parseKeywords(keywords, includedKeyword);
  const exclude = parseKeywords(keywords, excludedKeyword);

  return { type, key, relations, include, exclude };
};

class EngineEntryForWorldInfo extends StateEngineEntry {
  /**
   * @param {WorldInfoEntry} worldInfo
   */
  constructor(worldInfo) {
    super(worldInfo.id)
    this.worldInfo = worldInfo;
    const parsedResult = this.parse(worldInfo);

    this.key = parsedResult.key;
    this.relations = new Set(parsedResult.relations);
    this.include = new Set(parsedResult.include);
    this.exclude = new Set(parsedResult.exclude);
  }

  /**
   * @param {AIDData} data
   * @param {Map<string, string[]>} issuesMap
   * @returns {Iterable<StateEngineEntry>}
   */
  static *produceEntries(data, issuesMap) {
    for (const info of data.worldEntries) {
      try {
      const type = exports.extractType(info);
      if (!type || type !== this.forType) continue;
      yield new this(info);
      }
      catch(err) {
        if (err instanceof InvalidTypeError) {
          // Technically, we checked this before hand and it shouldn't happen.
          // But just in case of shenanigans, we count this as just a mismatch
          // from a child-type and just continue.
          console.log(err.message);
          continue;
        }
        if (err instanceof BadStateEntryError) {
          // Log this error out to the user, associated with the world-info entry.
          const renderAs = worldInfoString(info);
          const issues = issuesMap.get(renderAs) ?? [];
          issues.push(err.message);
          issuesMap.set(renderAs, issues);
          continue;
        }
        // Not one of ours?  Throw it.
        throw err;
      }
    }
  }

  get infoKey() {
    return this.worldInfo.keys;
  }

  /**
   * Transforms a `WorldInfoEntry` into a `WorldStateData` object by parsing its
   * `keys` property.  If it fails, it will return `null`.
   * 
   * @param {WorldInfoEntry} worldInfo 
   * @throws If parsing failed.
   * @throws If parsing succeeded, but the extracted type did not match.
   * @returns {Omit<StateEngineData, "entryId">}
   */
  parse(worldInfo) {
    const { keys } = worldInfo;
    if (keys.indexOf(",") !== -1)
      throw new BadStateEntryError([
        "The World Info entry's keys contain a comma.",
        "Keywords should be separated by a semi-colon (;), instead."
      ].join("  "));

    const parsedResult = exports.infoKeyParserImpl(keys);
    if (!parsedResult)
      throw new BadStateEntryError(
        `Failed to parse World Info entry as a \`${this.type}\`.`
      );
    if (parsedResult.type !== this.type)
      throw new InvalidTypeError([
        `Expected World Info entry to parse as a \`${this.type}\``,
        `but it parsed as a \`${parsedResult.type}\` instead.`
      ].join(", "));

    return parsedResult;
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
   * Serializes an `EngineEntryForWorldInfo` into an `EngineDataForWorldInfo`.
   * 
   * @returns {EngineDataForWorldInfo}
   */
  toJSON() {
    const { infoKey } = this;
    return { ...super.toJSON(), infoKey, forWorldInfo: true };
  }
}

exports.EngineEntryForWorldInfo = EngineEntryForWorldInfo;