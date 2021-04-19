const { chain, getText } = require("../../utils");
const { entrySorter } = require("../entrySorting");
const { entrySelector } = require("../entrySelection");

/**
 * Yields lines from the player memory, ignoring lines starting with a `#` symbol.
 * Currently, they just jam the summary into the player-defined memory with a comment
 * warning you not to screw things up.
 * 
 * @param {string} playerMemory
 * @returns {Iterable<SortableEntry & { text: string }>}
 */
const convertPlayerMemory = function* (playerMemory) {
  const lines = getText(playerMemory).split("\n");
  for (let i = 0, lim = lines.length; i < lim; i++) {
    const text = lines[i].trim();
    if (text.startsWith("#")) continue;
    yield { text, priority: (i + 1000) * -1, score: 100 };
  }
};

/**
 * @param {string} playerMemory
 * The player memory.  May contain the summary portion if With-Memory is not running.
 * @param {string | undefined} summary
 * If With-Memory is running, the extracted summary.
 * @param {StateDataCache} cacheData
 * The current-turn State Engine cache data.
 * @param {(id: string) => string} getEntryText
 * Function that obtains an entry's text.
 * @returns {string}
 */
const produceContextMemory = (playerMemory, summary, cacheData, getEntryText) => {
  const forContext = cacheData?.forContextMemory ?? [];
  const forHistory = cacheData?.forHistory ? Object.values(cacheData.forHistory) : [];
  const resolvedSummary = summary ?? "";

  return chain()
    .concat(forContext, forHistory)
    .map((entry) => ({ ...entry, text: getEntryText(entry.infoId)}))
    .concat(convertPlayerMemory(playerMemory))
    .thru(entrySorter)
    .thru((notes) => entrySelector(notes, 1001 - resolvedSummary.length, {
      lengthGetter: ({ text }) => text.length + 1
    }))
    .map((note) => note.text.trim())
    .concat(resolvedSummary)
    .filter(Boolean)
    .toArray()
    .join("\n");
};

/**
 * Uses the natural sorting utiltiies to select entries for display in the memory.
 * Also inserts the Author's Note and Front Memory.
 * 
 * All the data we selected is in the turn cache for later; this step is just to
 * help with the edit distance restrictions and make this functional without any
 * other supporting plugins.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;
  const { state: { memory }, playerMemory, summary } = data;

  const cacheData = ctx.theCache.storage;
  if (!cacheData) return;

  const newContextMem = produceContextMemory(
    playerMemory, summary, cacheData,
    (id) => getText(ctx.entriesMap[id])
  );
  if (newContextMem) memory.context = newContextMem;
  
  // Only set these if it is not already set by something else.
  if (cacheData.forAuthorsNote && !memory.authorsNote) {
    const entry = ctx.entriesMap[cacheData.forAuthorsNote.infoId];
    const newAuthorsNote = getText(entry).trim();
    if (newAuthorsNote) memory.authorsNote = newAuthorsNote;
  }
  
  if (cacheData.forFrontMemory && !memory.frontMemory) {
    const entry = ctx.entriesMap[cacheData.forFrontMemory.infoId];
    const newFrontMemory = getText(entry).trim();
    if (newFrontMemory) memory.frontMemory = newFrontMemory;
  }
};