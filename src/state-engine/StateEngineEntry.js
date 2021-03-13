const regex = {
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
 * 
 * @param {string[]} keywords 
 * @param {RegExp} reMatcher 
 */
const _parseKeywords = (keywords, reMatcher) => {
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
 * @param {WorldInfoEntry["id"]} infoId
 * @param {WorldInfoEntry["keys"]} infoKey
 * @returns {StateEngineData | undefined}
 */
 const _infoKeyParserImpl = (infoId, infoKey) => {
  const [, type, dec] = regex.infoEntry.exec(infoKey) ?? [];
  if (!type) return undefined;

  const [, fullKey, keywordPart] = regex.infoDeclaration.exec(dec) ?? [];
  // Full-key part parsing.
  // @ts-ignore - TS too dumb with `??` and `[]`.
  const [, key = null, relationPart] = (fullKey && regex.infoFullKey.exec(fullKey)) || [];
  const relations = relationPart?.split("&").map(s => s.trim()).filter(Boolean) ?? [];
  // Keyword part parsing.
  const keywords = keywordPart?.split(";").map(s => s.trim()).filter(Boolean) ?? [];
  const include = _parseKeywords(keywords, regex.includedKeyword);
  const exclude = _parseKeywords(keywords, regex.excludedKeyword);

  return { infoId, infoKey, type, key, relations, include, exclude };
};

/**
 * @implements {StateEngineData}
 */
class StateEngineEntry {
  /**
   * @param {StateEngineData} stateData
   * @param {WorldInfoEntry} worldInfo
   */
  constructor(stateData, worldInfo) {
    this.infoId = stateData.infoId;
    this.infoKey = stateData.infoKey;
    this.key = stateData.key;
    this.type = stateData.type;
    this.relations = stateData.relations;
    this.include = stateData.include;
    this.exclude = stateData.exclude;
    this.worldInfo = worldInfo;
  }

  /**
   * Deserializes a `StateEngineData` into a `StateEngineEntry`.
   * 
   * @param {import("aid-bundler/src/aidData").AIDData} data 
   * @param {StateEngineData} stateData
   * @returns {StateEngineEntry | null}
   */
   static fromJSON(data, stateData) {
    const { infoId } = stateData;
    const worldInfo = data.worldEntries.find((wi) => wi.id === infoId);
    if (!worldInfo) return null;
    return new StateEngineEntry(stateData, worldInfo);
  }

  /**
   * Transforms a `WorldInfoEntry` into a `WorldStateData` object by parsing its
   * `keys` property.  If it fails, it will return `null`.
   * 
   * @param {WorldInfoEntry} worldInfo 
   * @returns {StateEngineData | null}
   */
  static parse(worldInfo) {
    const { id, keys } = worldInfo;
    const parsedResult = _infoKeyParserImpl(id, keys);
    if (parsedResult) return parsedResult;

    // Trying falling back on a default for vanilla entries.
    if (keys.startsWith("$")) return null;

    return {
      infoId: id,
      infoKey: keys,
      key: null,
      type: "VanillaEntry",
      relations: [],
      include: keys.split(",").map(s => s.trim()).filter(Boolean),
      exclude: []
    };
  }

  /**
   * Constructs `WorldStateData` from a given `WorldInfoEntry`.  If it fails to parse,
   * it will return `null`.
   * 
   * @param {WorldInfoEntry} worldInfo 
   * @returns {StateEngineEntry | null}
   */
  static createFrom(worldInfo) {
    const stateData = this.parse(worldInfo);
    if (stateData == null) return null;
    return new StateEngineEntry(stateData, worldInfo);
  }

  get text() {
    return this.worldInfo.entry;
  }

  /**
   * Serializes a `StateEngineEntry` into a `StateEngineData`.
   * 
   * @returns {StateEngineData}
   */
  toJSON() {
    const { infoId, infoKey, type, key, relations, include, exclude } = this;
    return { infoId, infoKey, type, key, relations, include, exclude };
  }
}

module.exports.StateEngineEntry = StateEngineEntry;