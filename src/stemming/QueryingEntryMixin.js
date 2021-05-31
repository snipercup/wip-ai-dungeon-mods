const { shutUpTS, tuple } = require("../utils");

/** @typedef {import("../state-engine/StateEngineEntry").StateEngineEntry} StateEngineEntry */
/** @typedef {typeof import("../state-engine/StateEngineEntry").StateEngineEntry} StateEngineEntryClass */

const $$stemText = Symbol("Querying.stemText");

/**
 * @template {StateEngineEntryClass} TKlass
 * @param {AIDData} data
 * @param {TKlass} Klass
 */
exports.makeQuerying = (data, Klass) => {
  const stemming = require("./index");
  const { isHistoryKey, isWorldInfoKey } = stemming;
  const { parseHistoryKey, parseWorldInfoKey } = stemming;

  // @ts-ignore - TS is stupid with mixins right now.
  return class extends Klass {

    // @ts-ignore - Ditto.
    constructor(...args) {
      // @ts-ignore - Annnnd ditto.
      super(...args);

      /**
       * Private backing store for `stemText`.
       * 
       * @type {string | undefined}
       */
      this[$$stemText] = undefined;
    }

    /** The compiled corpus of texts used for TF-IDF querying. */
    get corpus() {
      return stemming.getStemmingData(data).corpus;
    }

    /** A map of document keys to the stemmed version of their text. */
    get stemMap() {
      return stemming.getStemmingData(data).stemMap;
    }

    /**
     * The stemmed text for this entry.
     * 
     * @type {string}
     */
    get stemText() {
      // Due to deferred initialization, we have to make this a getter.
      const { [$$stemText]: storedText } = this;
      if (typeof storedText === "string") return storedText;
      if (!this.text.trim()) return "";
      const result = stemming.stemText(this.text);
      this[$$stemText] = result;
      return result;
    }

    /**
     * Locates any text in the corpus that appears to be similar to this entry's text.
     * 
     * @returns {Array<[Stemming.AnyKey, number]>}
     */
    queryOnAll() {
      if (!this.stemText) return [];
      return shutUpTS(this.corpus.getResultsForQuery(this.stemText));
    }

    /**
     * Locates history entries that appear to be similar to this entry's text.
     * 
     * @returns {Array<[source: number, score: number]>}
     */
    queryOnHistory() {
      if (!this.stemText) return [];
      return this.corpus.filteredQuery(this.stemText, isHistoryKey)
        .map(([stemKey, score]) => {
          /** @type {number} */
          const source = shutUpTS(parseHistoryKey(stemKey));
          return tuple(source, score);
        });
    }

    /**
     * Locates other world-info entries that appear to be similar to this entry's text.
     * 
     * @returns {Array<[worldInfoId: string, score: number]>}
     */
    queryOnWorldInfo() {
      if (!this.stemText) return [];
      return this.corpus.filteredQuery(this.stemText, isWorldInfoKey)
        .map(([stemKey, score]) => {
          /** @type {string} */
          const worldInfoId = shutUpTS(parseWorldInfoKey(stemKey));
          return tuple(worldInfoId, score);
        });
    }

  };
};