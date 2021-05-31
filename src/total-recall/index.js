/// <reference path="../state-engine/state-engine.d.ts" />
const { Document } = require("tiny-tfidf");
const { shutUpTS, tuple, chain, getContinuousText } = require("../utils");
const { addStateEntry } = require("../state-engine/registry");

/** How many actions must exist before we'll begin recalling. */
const earliestActionForQuery = 50;
/** How many entries after that we'll look through. */
const queryCountLimit = 100;

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
const init = (data) => {
  const { StateEngineEntry } = require("../state-engine/StateEngineEntry");
  const { makeQuerying } = require("../stemming/QueryingEntryMixin");
  const { stemText, parseHistoryKey } = require("../stemming");

  /**
   * This entry looks for matches in the later half of the available action history
   * and uses an TF-IDF search to locate a previous entry that appears to be
   * relevant.  If it finds one, it will be included in the context.
   */
  class RecallEntry extends makeQuerying(data, StateEngineEntry) {

    constructor() {
      super();
      this.init(`Recall<${data.actionCount}>`);

      /**
       * The action text and score that best matches `History(0)`.
       * 
       * @type {[text: string, score: number] | null}
       */
      this.bestResult = null;
    }

    /**
     * @param {AIDData} data
     * @returns {Iterable<StateEngineEntry>}
     */
    static *produceEntries(data) {
      // Only produce an entry if we have enough action history for it
      // to be useful.  We'll throw in an extra 20 actions, just so we
      // have a few entries to work with.
      const neededLength = earliestActionForQuery + 20;
      // How many history entries it provides seems to vary.  One adventure
      // gave me 100 while another gave 200.  Weird.
      if (data.history.length < neededLength) return;
      yield new RecallEntry();
    }

    static get forType() { return "Recall"; }
    get targetSources() { return tuple("implicit"); }
    get priority() { return -1; }

    /** Use the text of our best result as the actual entry text. */
    get text() {
      if (this.bestResult == null) return "";
      const [text] = this.bestResult;
      return `An earlier, relevant event: ${text}`;
    }

    /** Use the history's stemmed text for the query. */
    get stemText() {
      return this.stemMap.get("History(0)") ?? "";
    }

    /**
     * Re-scores a line against the latest history entry.
     * 
     * Produces `undefined` if its score was not above zero.
     * 
     * @param {string} line 
     * @returns {[line: string, score: number] | undefined}
     */
    rescoreLine(line) {
      const stemLine = stemText(line);
      if (!stemLine) return undefined;

      const terms = new Document(stemLine).getUniqueTerms();
      const score = this.corpus.evaluateScore(terms, "History(0)");
      if (score <= 0) return undefined;
      return tuple(line, score);
    }

    *fetchRelevantActionLines() {
      // Perform a query on history entries in the range we want to search.
      // These queries can take a while.  Only consider a limited amount.
      const limit = earliestActionForQuery + queryCountLimit;
      const results = this.corpus.filteredQuery(this.stemText, (docKey) => {
        const source = parseHistoryKey(docKey);
        if (source == null) return false;
        if (source < earliestActionForQuery) return false;
        return source < limit;
      });

      // We'll emit up to 5 unique results from the query.
      let resultsEmitted = 0;
      // But avoid emitting the same blocks of continuous text.
      /** @type {Set<number>} */
      const emittedBlocks = new Set();

      for (const [docKey, score] of results) {
        if (resultsEmitted >= 5) return;

        /** @type {number} We know this will parse. */
        const source = shutUpTS(parseHistoryKey(docKey));

        // Translate from source to index.
        const historyIndex = (data.history.length - 1) - source;

        // Get the continuous entries from that index; short circuit if we've already
        // emitted this block.  This can actually happen often, as relevant material
        // is often grouped up together.
        const { start, elements } = getContinuousText(historyIndex, data.history);
        if (emittedBlocks.has(start)) continue;
        emittedBlocks.add(start);

        // Sanity check; we do have something, right?
        if (elements.length === 0) continue;

        // Otherwise, join them together then split on the newlines.  Some posts
        // can get awfully long, so we may not need the whole block.
        const contText = chain(elements)
          .map((history) => history.text)
          .toArray().join("").split("\n")
          .map((text) => text.trim())
          .filter(Boolean);

        // Do upkeep and short circuiting.  We don't need to do anything special
        // if the entry has only one line or no lines.
        if (contText.length > 0) resultsEmitted += 1;
        if (contText.length === 1) yield tuple(contText[0], score);
        if (contText.length <= 1) continue;

        // If we get here, we have a bit of an odd situation.  The information we
        // want may not be a complete thought because the entry carries across
        // multiple actions.  So, let's re-score it all so we can find which was
        // the most relevant portion.
        for (const line of contText) {
          const lineScore = this.rescoreLine(line);
          if (lineScore) yield lineScore;
        }
      }
    }

    modifier() {
      // Here we figure out our result.  `fetchRelevantActionLines` may not
      // produce results in descending score order, so we'll do that here.
      // It should produce 5 results from querying the history, but because
      // actions can continue previous actions, we may have more than that,
      // with lines from multiple entries being re-scored.
      const [result = null] = [...this.fetchRelevantActionLines()].sort((a, b) => b[1] - a[1]);
      this.bestResult = result;
    }

    /**
     * @param {MatchableEntry} matcher 
     * @param {AssociationParamsFor<this>} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      if (this.bestResult == null) return false;
      return this.bestResult[1] > 0;
    }

    valuator() {
      // Sanity check.
      if (this.bestResult == null) return 0;
      const [, bestScore] = this.bestResult;

      // Grab the top terms for the latest action.
      const topTerms = this.corpus.getTopTermsForDocument("History(0)");
      // If there's a good number of terms, we'll trim off one of the strongest
      // terms for every 5 terms in the entry.  This gives an edge to the
      // recalled text.
      const usedTerms = topTerms.slice(Math.floor(topTerms.length / 5));
      if (usedTerms.length === 0) return 0;

      // Only allow this match if the best score is more than double the
      // average of the latest action's terms' scores.  This generally means
      // it needs to have matched one very strong term or a few middling terms.
      // This is intended to improve relevancy.
      const sumOfTerms = usedTerms.reduce((pv, [, score]) => pv + score, 0);
      const threshold = (sumOfTerms / usedTerms.length) * 2;
      if (bestScore <= threshold) return 0;

      // Apply the same scoring booster as Deep-State.
      return 20 * Math.pow(1.05, this.bestResult[1]);
    }

    /**
     * Serializes a `RecallEntry` into a `StateEngineData`.
     * 
     * @returns {StateEngineData}
     */
    toJSON() {
      return { ...super.toJSON(), text: this.text };
    }
  }

  addStateEntry(RecallEntry);
};

/** @type {StateModule} */
exports.stateModule = {
  pre: [init]
};