const { chain, shutUpTS, limitText } = require("../utils");

/**
 * Sorts by score, descending.
 * 
 * @param {SortableEntry} a
 * @param {SortableEntry} b
 * @returns {number}
 */
const byScore = (a, b) => (b.score ?? 0) - (a.score ?? 0);

/**
 * Sorts by order, ascending.
 * 
 * @param {WithOrdering} a
 * @param {WithOrdering} b
 * @returns {number}
 */
const byOrder = (a, b) => a.order - b.order;

/** @type {(value: SortableEntry) => number} */
const defaultLengthGetter = ({ text }) => text ? text.length + 1 : 0;

/**
 * @template {Iterable<SortableEntry & WithOrdering>} TEntries
 * @param {TEntries} sortedEntries
 * @param {number} textLimit
 * @param {Object} [options]
 * @param {boolean} [options.permissive]
 * @param {(entry: ElementOf<TEntries>) => number} [options.lengthGetter]
 * @returns {Iterable<ElementOf<TEntries>>}
 */
module.exports.entrySelector = (sortedEntries, textLimit, options) => {
  const result = chain(sortedEntries)
    .thru((entries) => [...entries].sort(byScore))
    .thru((sortedNotes) => limitText(sortedNotes, textLimit, {
      lengthGetter: options?.lengthGetter ?? defaultLengthGetter,
      permissive: options?.permissive ?? true
    }))
    .value((limitedEntries) => [...limitedEntries].sort(byOrder));

  return shutUpTS(result);
};