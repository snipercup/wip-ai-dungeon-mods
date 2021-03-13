/// <reference path="global.d.ts" />
/// <reference path="state-engine.common.js" />

/**
 * Annotated Prompt
 * Give me a proper description.
 * 
 * Example output:
 * ```
 * Theme:
 * The author's note will appear here.
 * Notes:
 * • A state entry will appear here.
 * • In fact, a few of them can across multiple lines.
 * • Hopefully the AI will understand that things mentioned in
 * the text are referenced here.
 * Story:
 * Here the contents of the recent history will appear.
 * If there is a front-memory set, it will appear as the last
 * line of the text.
 * ```
 */

 /** @type {ModifierExecutionFn} */
const $$turnPatternPrompt = (text) => {
  const playerTurns = history.reduce(
    (acc, entry) => entry.type === "story" ? acc + 1 : acc,
    0
  );
  if (playerTurns < 2) return { text };

  const { authorsNote, context, frontMemory } = state.memory;

  const themeText = dew(() => {
    if (!authorsNote) return "";
    const theTheme = authorsNote
      .split("\n").map((s) => s.trim())
      .join("  ");
    if (theTheme.length === 0) return "";
    return ["Theme:\n", theTheme, "\n"].join("");
  });

  const { maxChars } = info;
  const refText = dew(() => {
    const theRef = context?.trim() || "";
    if (theRef.length === 0) return "";
    const points = theRef.split("\n").map((s) => `• ${s.trim()}`).join("\n");
    return ["Notes:\n", points, "\n"].join("");
  });

  const storyText = dew(() => {
    const prompt = "Story:\n";
    const bodyParts = [];
    if (frontMemory) bodyParts.push(frontMemory.trim());

    let currentLength = [refText, themeText, prompt, ...bodyParts].reduce(sumLength, 0);
    for (const entry of [...iterReverse(history)]) {
      if (entry.text.length === 0) continue;
  
      let curText = entry.text.trim();
      if (curText.length === 0) continue;
  
      curText = `${entry.text.trim()}\n`;
      if (currentLength + curText.length > maxChars) break;
      bodyParts.push(curText);
      currentLength += curText.length;
    }
    return `${prompt}${bodyParts.reverse().join("").trim()}`;
  });

  const newText = [themeText, refText, storyText].join("");

  return { text: newText };
};

/**
 * Creative Writing Prompt
 * Reformats the context such that it looks similar to a grade school
 * creative writing prompt.  Requires `state.$$stateEntries` to operate.
 * 
 * Example output:
 * ```
 * GIVEN the following:
 * • A state entry will appear here, following a bullet-point.
 * • In fact, a few of them can across multiple lines.
 * • Hopefully the AI will understand that things mentioned in
 * the text are referenced here.
 * 
 * READ this passage:
 * All of the recent posts will be placed here.
 * Hopefully, when they reach the final prompt, it will understand
 * what it must do ...and hopefully not write it like a 4th grader.
 * 
 * THEME your writing:
 * The author's note will appear here, if set.
 * 
 * CONTINUE the story:
 * ```
 * 
 * The hope is, it will recognize the bullet-points as "special"
 * context separate from the actual story parts.  The formatting
 * may also help it fall into a part of its model that is
 * specialized to creative story writing.
 * 
 * It is probable that this prompt will eat up a lot of the
 * context space available, greatly reducing how much information
 * is available to the AI.
 * 
 * You can use the `favorPosts` configuration to try and tune it
 * such that more of the "READ" passage is filled, but this will
 * sacrifice "GIVEN" entries.
 */

/* Exports. */

/** @type {ModifierExecutionFn[]} */
const $$contextModifiers = [
  $$turnPatternPrompt
];

/* Main modifier. */

/** @type {ModifierFn} */
const modifier = (text) => {
  let modifiedText = text;
  for (const cm of $$contextModifiers) {
    const result = cm(text);
    if (result) {
      modifiedText = result.text;
      if (result.stop)
        return { text: modifiedText, stop: true };
    }
  }

  return { text: modifiedText };
};

// Don't modify this part
modifier(text);
