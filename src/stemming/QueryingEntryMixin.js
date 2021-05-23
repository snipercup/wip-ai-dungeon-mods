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
  const { stemText, getStemmingData, parseHistoryKey, parseWorldInfoKey } = require("./index");

  const { corpus, stemMap } = getStemmingData(data);

  // @ts-ignore - TS is stupid with mixins right now.
  return class extends Klass {

    // @ts-ignore - Ditto.
    constructor(...args) {
      // @ts-ignore - Annnnd ditto.
      super(...args);

      /**
       * The compiled corpus of texts used for TF-IDF querying.
       * 
       * @type {import("tiny-tfidf").Corpus}
       */
      this.corpus = corpus;

      /**
       * A map of document keys to the stemmed version of their text.
       * 
       * @type {Map<Stemming.AnyKey, string>}
       */
      this.stemMap = stemMap;

      /**
       * Private backing store for `stemText`.
       * 
       * @type {string | undefined}
       */
      this[$$stemText] = undefined;
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
      const result = stemText(this.text);
      this[$$stemText] = result
      return result;
    }

    /**
     * Locates any text in the corpus that appears to be similar to this entry's text.
     * 
     * @returns {Array<[Stemming.AnyKey, number]>}
     */
    queryOnAll() {
      return shutUpTS(this.corpus.getResultsForQuery(this.stemText));
    }

    /**
     * Locates history entries that appear to be similar to this entry's text.
     * 
     * @returns {Iterable<[source: number, score: number]>}
     */
    *queryOnHistory() {
      for (const [doc, score] of this.queryOnAll()) {
        const source = parseHistoryKey(doc);
        if (source == null) continue;

        yield tuple(source, score);
      }
    }

    /**
     * Locates other world-info entries that appear to be similar to this entry's text.
     * 
     * @returns {Iterable<[worldInfoId: string, score: number]>}
     */
    *queryOnWorldInfo() {
      for (const [doc, score] of this.queryOnAll()) {
        const worldInfoId = parseWorldInfoKey(doc);
        if (worldInfoId == null) continue;

        yield tuple(worldInfoId, score);
      }
    }

  };
};