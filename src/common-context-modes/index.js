/// <reference path="./common-context-mode.d.ts" />
/// <reference path="../context-mode/context-mode.d.ts" />
const { dew, getText } = require("../utils");
const { chain, iterReverse, iterPosition, limitText } = require("../utils");
const { getClosestCache, getStateEngineData, buildHistoryData } = require("../context-mode/utils");
const { cleanText, sumOfUsed, joinedLength } = require("../context-mode/utils");
const { entrySorter } = require("../state-engine/entrySorting");
const { entrySelector } = require("../state-engine/entrySelection");

const MAX_MEMORY_FACTOR = 1/3;

/**
 * Constructs a variations on a relatively successful context pattern.
 * 
 * @param {CommonModeConfig} config 
 * @returns {BundledModifierFn}
 */
const contextModifier = (config) => (data) => {
  // Only begin working after the second turn.
  if (data.actionCount <= 2) return;

  const { state, info, playerMemory, summary } = data;
  const { authorsNote, frontMemory } = state.memory;
  const { maxChars } = info;

  // Determine how much of the context we're going to commit to extra stuff.
  const maxMemory = (maxChars * MAX_MEMORY_FACTOR) | 0;

  // Materialize the history data into an array, limiting it to the entries
  // that can possibly fit into the context.  This comes out already reversed.
  const historyData = chain(buildHistoryData(data))
    .filter((entry) => entry.lengthToHere <= maxChars)
    .toArray();
  
  // Compile a set of history sources, so we know (roughly) how far back we can look.
  const historySources = new Set(chain(historyData).map((hd) => hd.sources.keys()).flatten().value());

  const authorsNoteText = dew(() => {
    if (!authorsNote) return "";
    const theStyle = cleanText(authorsNote);
    if (theStyle.length === 0) return "";
    return [`[${config.authorsNoteText}: `, ...theStyle.join(" "), "]"].join("");
  });

  const styleLength = joinedLength(authorsNoteText);

  // We require State Engine to function, but can still style a few things.
  const cacheData = getClosestCache(data);
  
  // Convert the player memory into something resembling State Engine entries,
  // and incorporate any State Engine entries we want to use as notes.
  /** @type {Iterable<CommonModeEntry>} */
  const theNotes = dew(() => {
    const forContext = cacheData?.forContextMemory ?? [];
    const forHistory = cacheData?.forHistory ? Object.values(cacheData.forHistory) : [];
    return chain()
      .concat(forContext, forHistory)
      .map((cached) => getStateEngineData(data, cached))
      .filter(Boolean)
      .filter((sd) => typeof sd.source !== "number" || historySources.has(sd.source))
      .map((sd) => ({ ...sd, text: cleanText(sd.text).join("  ") }))
      .concat(dew(() => {
        if (!playerMemory) return [];
        return cleanText(playerMemory)
          .map((text, i) => ({ text, priority: (i + 1000) * -1, score: 40 }));
      }))
      .value();
  });

  // In this context mode, we group all these entries into a "Notes:"
  // section.  If we run low on space, we have to use some strategy to
  // trim things down.
  const notesText = dew(() => {
    return chain(theNotes)
      .thru(entrySorter)
      .thru((notes) => entrySelector(
        notes,
        // Have to account for the new lines for `styleLines` and `NOTES`.
        // @ts-ignore - Not typing the `reduce` correctly.
        maxMemory - [styleLength, NOTES].reduce(sumOfUsed(), 0),
        { lengthGetter: ({ text }) => text.length + 1 }
      ))
      .map((note) => note.text.trim())
      .filter(Boolean)
      .map((text) => `• ${text}`)
      .value((limitedNotes) => {
        const result = [...limitedNotes];
        if (result.length === 0) return [];
        return [`${config.notesHeader}:`, ...result];
      });
  });

  const notesLength = joinedLength(notesText);

  const storyText = dew(() => {
    // This comes behind the history we emit.
    const theSummary = cleanText(summary).reverse();
    const summaryLength = joinedLength(theSummary);
    // This comes in front of the history we emit.
    return chain([frontMemory])
      .concat(historyData)
      .map(getText)
      // Break the story text into individual lines, so that we can potentially
      // include one more line of story text before hitting the limit.
      .map((s) => s.split("\n").reverse())
      .flatten()
      .map((s) => s.trim())
      .filter(Boolean)
      .thru((story) => limitText(
        story,
        // Have to account for the new lines...
        // @ts-ignore - Not typing the `reduce` correctly.
        maxChars - [notesLength, BREAK, summaryLength, styleLength].reduce(sumOfUsed(), 0),
        {
          // Here we account for the new line separating each line of the story.
          lengthGetter: (text) => text ? text.length + 1 : 0
        }
      ))
      // Finally, lets insert the `authorsNoteText` on the third line-break
      // from the end of the context.  This will make sure it's closer
      // to the end of the context, and will hopefully have more weight
      // with the AI.
      .thru(function* (story) {
        if (authorsNoteText) {
          for (const [pos, text] of iterPosition(story)) {
            if (pos === 3) yield authorsNoteText;
            yield text;
          }
        }
        else yield* story;
      })
      .concat(theSummary, config.notesBreak)
      .thru(iterReverse)
      .value();
  });

  data.text = [...notesText, ...storyText].join("\n");
};

/**
 * A context mode that resembles the forward section of fan-fiction.
 * 
 * @type {ContextModeModule}
 */
exports.forwardModule = {
  name: "forward",
  context: contextModifier({
    notesHeader: "Reader's Notes",
    notesBreak: "--------",
    authorsNoteText: "Author's Note"
  })
};

/**
 * A context mode that resembles an audio book script, perhaps.
 * 
 * @type {ContextModeModule}
 */
exports.narratorModule = {
  name: "narrator",
  context: contextModifier({
    notesHeader: "Narrator's Notes",
    notesBreak: "\n",
    authorsNoteText: "Direction"
  })
};