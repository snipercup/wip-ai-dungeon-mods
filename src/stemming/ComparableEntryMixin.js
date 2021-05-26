const { shutUpTS, dew } = require("../utils");
const { EngineEntryForWorldInfo } = require("../state-engine/EngineEntryForWorldInfo");

/** @type {(entry: unknown) => entry is Stemming.EntryWithStemKey} */
const hasStemKey = (entry) => {
  if (typeof entry !== "object") return false;
  if (entry == null) return false;
  return "stemKey" in entry;
};

/** @type {(entry: unknown) => entry is Stemming.EntryWithWorldInfo} */
const hasWorldInfo = (entry) => {
  if (typeof entry !== "object") return false;
  if (entry == null) return false;
  if (entry instanceof EngineEntryForWorldInfo) return true;
  // @ts-ignore - It'll probably be fine...
  return "worldInfo" in entry && "id" in entry.worldInfo;
};

/**
 * @template {typeof EngineEntryForWorldInfo} TKlass
 * @param {AIDData} data
 * @param {TKlass} Klass
 */
exports.makeComparable = (data, Klass) => {
  const { getStemmingData } = require("./index");

  // @ts-ignore - TS is stupid with mixins right now.
  return class extends Klass {

    // @ts-ignore - Ditto.
    constructor(...args) {
      // @ts-ignore - Annnnd ditto.
      super(...args);

      // @ts-ignore - Still stupid.
      const { id } = this.worldInfo;

      /**
       * The key used for looking up this world-info in the corpus.
       * 
       * @type {Stemming.WorldInfoKey}
       */
      this.stemKey = shutUpTS(`WorldInfo(${id})`);
    }

    /** The compiled corpus of texts used for TF-IDF querying. */
    get corpus() {
      return getStemmingData(data).corpus;
    }

    /** A map of document keys to the stemmed version of their text. */
    get stemMap() {
      return getStemmingData(data).stemMap;
    }

    /** The stemmed text for this entry. */
    get stemText() {
      const value = this.stemMap.get(this.stemKey);
      if (typeof value === "string") return value;

      // This should not occur, and if it does, shut... down... EVERYTHING!
      throw new Error(`No stemming data for world-info \`${this.worldInfo.id}\` exists.`);
    }

    /**
     * Generates a similarity score between this entry and some other entry.
     * 
     * @param {Stemming.ComparableEntry} otherEntry
     * @returns {number} 
     */
    compareAgainst(otherEntry) {
      /** @type {Stemming.AnyKey | undefined} */
      const otherName = shutUpTS(
        dew(() => {
          if (typeof otherEntry === "string") return otherEntry;
          if (typeof otherEntry === "number") return `History(${otherEntry})`;
          if ("stemKey" in otherEntry) return otherEntry.stemKey;
          if ("worldInfo" in otherEntry) return `WorldInfo(${otherEntry.worldInfo.id})`;
          return undefined;
        })
      );

      if (otherName == null) return 0;
      if (!this.stemMap.has(otherName)) return 0;

      /** @type {Array<[Stemming.AnyKey, number]>} */
      const commonTerms = shutUpTS(this.corpus.getCommonTerms(this.stemKey, otherName));
      return commonTerms.reduce((pv, [, cv]) => pv + cv, 0);
    }

    /**
     * Will use alternative keyword scaling when entries are associated without keywords.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {ValuationStats}
     */
    getKeywordStats(matcher, source, entry) {
      const stats = super.getKeywordStats(matcher, source, entry);

      // Only do comparison scoring when entry has no positive keywords.
      if (matcher.include.length > 0) return stats;

      const compareScore = dew(() => {
        if (typeof source === "number") return this.compareAgainst(source);
        if (hasStemKey(entry)) return this.compareAgainst(entry);
        if (hasWorldInfo(entry)) return this.compareAgainst(entry);
        return 0;
      });

      // Abort if it failed to match anything useful.
      if (compareScore === 0) return stats;

      // Undo the penalty for failing to match any keywords, if needed.
      const finalScalar = Math.pow(1.05, compareScore) * Math.max(1, stats.scalar);

      return { ...stats, scalar: finalScalar };
    }

  };
};