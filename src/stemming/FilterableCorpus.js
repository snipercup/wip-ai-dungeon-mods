const { Corpus, Document } = require("tiny-tfidf");
const { tuple } = require("../utils");

class FilterableCorpus extends Corpus {
  /**
   * Constructs a corpus from a map of document names to their contained text.
   * 
   * @param {Map<string, string>} documentMap 
   * @param {Object} [options]
   * @param {boolean} [options.useDefaultStopwords = true]
   * @param {string[]} [options.customStopwords = []]
   * @param {number} [options.K1 = 2.0]
   * @param {number} [options.b = 0.75]
   * @returns {FilterableCorpus}
   */
  static fromMap(documentMap, options) {
    const { useDefaultStopwords, customStopwords, K1, b } = options ?? {};
    return new FilterableCorpus(
      [...documentMap.keys()],
      [...documentMap.values()],
      useDefaultStopwords,
      customStopwords,
      K1, b
    );
  }

  /**
   * Generates a score for the array of unique terms versus the document
   * identified by `documentKey`.
   * 
   * @param {string[]} uniqueQueryTerms
   * @param {string} documentKey
   * @returns {number}
   */
  evaluateScore(uniqueQueryTerms, documentKey) {
    const vector = this.getDocumentVector(documentKey);
    if (!vector) return 0;

    let score = 0.0;
    for (const term of uniqueQueryTerms) {
      const weight = vector.get(term);
      if (weight) score += weight;
    }
    return Math.max(0, score);
  }

  /**
   * @param {string} query
   * A string containing the query terms.
   * @param {(documentKey: string) => boolean} filterFn
   * A function that takes a document key and return `true` if the document
   * should be involved in the query.
   * @returns {Array<[documentKey: string, score: number]>}
   */
  filteredQuery(query, filterFn) {
    if (typeof query !== "string" || query.length === 0) return [];
    const terms = new Document(query).getUniqueTerms();

    return this.getDocumentIdentifiers()
      .filter(filterFn)
      .map((d) => tuple(d, this.evaluateScore(terms, d)))
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);
  }
}

exports.FilterableCorpus = FilterableCorpus;