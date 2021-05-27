/// <reference path="./stemming.d.ts" />

const { Plugin } = require("aid-bundler");
const { english: rootStopwords } = require("stopwords/english");
const { Corpus } = require("tiny-tfidf");
const { lancasterStemmer: stemmer } = require("lancaster-stemmer");
const { shutUpTS, chain, memoize, iterPosition, tuple, iterReverse } = require("../utils");

const exSpecialApostrophe = /'(?:s|ll|d)(?=\W|$)/g;
const exRestApostrophe = /(\w)'(\w)/g;
const exNotWord = /\W+/;

const stopwords = new Set(rootStopwords);

const stemWord = memoize(
  /** @type {(word: string) => string | undefined} */
  (word) => {
    if (!word) return undefined;
    if (stopwords.has(word)) return undefined;

    const stem = stemmer(word);
    if (!stem || stem.length <= 1) return undefined;

    return stem;
  }
);

const reHistoryKey = /^History\((.+)\)$/;
const reWorldInfoKey = /^WorldInfo\((.+)\)$/;

/**
 * Attempts to get the history source value (a `number`) from the given `key`.
 * 
 * @param {string} stemKey 
 * @returns {number | undefined}
 */
exports.parseHistoryKey = (stemKey) => {
  const [, sourceStr] = reHistoryKey.exec(stemKey) ?? [];
  return sourceStr ? Number(sourceStr) : undefined;
};

/**
 * Attempts to get the world-info ID (a `string`) from the given `key`.
 * 
 * @param {string} stemKey 
 * @returns {string | undefined}
 */
exports.parseWorldInfoKey = (stemKey) => {
  const [, worldInfoId] = reWorldInfoKey.exec(stemKey) ?? [];
  return worldInfoId ? worldInfoId : undefined;
};

/**
 * Applies the stemmer to the given text.
 * 
 * @param {string} text
 * The text to stem.
 * @returns {string}
 */
exports.stemText = (text) => {
  const prepped = text
    // Lower-case everything for better memoization. 
    .toLowerCase()
    // Remove possessive forms and contractions often attached to names.
    .replace(exSpecialApostrophe, "")
    // Get rid of other common uses of apostrophes.
    .replace(exRestApostrophe, "$1$2")
    // Split it by the not-words, so we have a list of words.
    .split(exNotWord);
  
  // Dump it into the stemmer.
  return chain(prepped)
    .collect(stemWord)
    .value((words) => [...words].join(" "));
};

/**
 * 
 * @param {AIDData} data
 * @param {boolean} [forContext]
 * @returns {Stemming.Storage}
 */
exports.compileEntries = (data, forContext = false) => {
  const { history, text, worldEntries } = data;

  const allHistoryText = history.map(({text}) => text);
  if (!forContext) allHistoryText.push(text);

  /** @type {Iterable<[Stemming.HistoryKey, string]>} */
  const compiledHistory = shutUpTS(
    chain(allHistoryText)
      .thru(iterReverse)
      .thru(iterPosition)
      .map(([source, text]) => tuple(`History(${source})`, text))
      .value()
  );

  /** @type {Iterable<[Stemming.WorldInfoKey, string]>} */
  const allWorldInfo = shutUpTS(
    worldEntries.map((wi) => tuple(`WorldInfo(${wi.id})`, wi.entry))
  );

  const otherSources = [
    tuple("PlayerMemory", data.playerMemory),
    tuple("Summary", data.summary),
    tuple("FrontMemory", data.state.memory.frontMemory || "")
  ].filter(([_, text]) => Boolean(text));

  /** @type {Iterable<[Stemming.AnyKey, string]>} */
  const compiledData = chain()
    .concat(compiledHistory)
    .concat(allWorldInfo)
    .concat(otherSources)
    .map(([key, text]) => tuple(key, exports.stemText(text)))
    .value();
  
  const stemMap = new Map(compiledData);
  const corpus = new Corpus([...stemMap.keys()], [...stemMap.values()], false);

  return { stemMap, corpus };
};

/**
 * Gets the stemming data for the current run.
 * 
 * @param {AIDData} data
 * @returns {Stemming.Storage}
 */
exports.getStemmingData = (data) => {
  if (data.stemmingData) return data.stemmingData;
  data.stemmingData = exports.compileEntries(data, data.phase === "context");
  return data.stemmingData;
};

/** @type {BundledModifierFn} */
const generalModifier = (data) => {
  exports.getStemmingData(data);
};

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 */
exports.addPlugin = (pipeline) => {
  pipeline.addPlugin(new Plugin("Stemming",
    generalModifier,
    generalModifier,
    generalModifier
  ));
};