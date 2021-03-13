/// <reference path="global.d.ts" />
/// <reference path="state-engine.common.js" />

/* Cleanup */

/** @type {ModifierExecutionFn} */
function $$resetState() {
  delete state.message;
  state.memory.context = "";
  state.memory.frontMemory = "";
  return undefined;
}

/**
 * Commands
 * Simple command system.  Uses a leading `:` character for matching.
 * You must use the "story" mode to make use of this.
 */

const $$commands = {
  authNote: (arg) => {
    if (typeof arg === "string" && arg)
      state.memory.authorsNote = arg;
    else
      delete state.memory.authorsNote;
  },
  revealWorld: () => {
    for (let i = 0, lim = worldInfo.length; i < lim; i++) {
      const { keys, entry } = worldInfo[i];
      updateWorldEntry(i, keys, entry, true);
    }
  }
};

/**
 * Dynamic Author
 * Searches the three most recent posts for keywords and selects an author's
 * note to help flavor things.
 * 
 * The following note types are supported:
 * - `$note:default` - When no other notes are selected and something else has
 *   not already provided an author's note, it will use one of these entries.
 * - `$note:<keywords>` - The more often one of these keywords appear, the
 *   more likely it is to be selected.
 * 
 * Keywords in entries that support them must be separated by semi-colons; this
 * is to prevent their selection by the usual world info matching rules.
 */

/** @type {ModifierExecutionFn} */
// function $$dynamicAuthor(text) {
//   const defaultNotes = [];
//   const contextNotes = [];
//   let pickedNote = null;

//   for (const wi of worldInfo) {
//     const curNote = NoteEntry.createFrom(wi);
//     if (!curNote) continue;
//     if (curNote.isDefault) defaultNotes.push(curNote)
//     else contextNotes.push(curNote);
//   }

//   if (contextNotes.length > 0) {
//     const noteRoulette = new Roulette();
//     const searchText = [
//       text,
//       ...getFinal(history, 2).map(getText)
//     ];

//     for (const note of contextNotes) {
//       const countTotal = note.occurancesIn($$matchCounter, searchText);
//       if (countTotal > 0) noteRoulette.push(countTotal, note);
//     }

//     if (noteRoulette.count > 0)
//       pickedNote = noteRoulette.pick();
//   }

//   if (pickedNote == null && defaultNotes.length > 0) {
//     const luckyPick = Math.floor(Math.random() * defaultNotes.length);
//     pickedNote = defaultNotes[luckyPick];
//   }

//   if (pickedNote) state.memory.authorsNote = pickedNote.text;
//   return undefined;
// }

/**
 * Player Memory Injector
 * Injects as many lines of the player-set memory into the current context memory
 * as possible.  Lines listed on top are considered highest-priority.
 * 
 * The player's memories will appear before the context memory.
 */

/** @type {ModifierExecutionFn} */
function $$playerMemoryInjector() {
  const playerMem = memory || "";
  const contextMem = state.memory.context;
  if (!contextMem || !playerMem) return undefined;
  
  const playerLines = playerMem.split("\n").map((line) =>  line.trim());
  
  const addedLines = [];
  let curLength = contextMem.length;
  for (const line of playerLines) {
    const newLength = line.length + curLength + 1;
    if (newLength >= 1000) break;
    addedLines.push(line);
    curLength = newLength;
  }
  
  state.memory.context = [...addedLines, contextMem].join("\n");
}

/**
 * Forced Action Injector
 * A complex system that will periodically insert a sudden action using
 * the front-memory after certain cooldowns and keywords are matched.
 * 
 * Provide world info entries in the format of:
 * `$force(<cooldown>):<keywords>`
 * 
 * Note: the keyword portion is not required.  You can create forced
 * actions like `$force(20)` to have something trigger every 20 turns.
 * 
 * The cooldown establishes how many turns must pass before the action
 * is checked.  When it activates, it will check the entire history
 * to match keywords.
 * 
 * The kewords have two modes:
 * - Keywords prefixed with `+` must be present when the check happens.
 * - Keywords prefixed with `-` must not be present when the check happens.
 * 
 * If the check succeeds, the world info's entry will be inserted in front
 * of the player's action.
 * 
 * For best results, write the forced action in a way that the AI will be
 * inclined to add flavor to the forced action.
 * 
 * For instance, to simulate a hunger system, you may write:
 * "Your stomach growls hungrily."
 * 
 * Or if you want a bumbling character who stumbles now and then:
 * "You begin to lose your balance!"
 * 
 * As this text is the very last thing the AI sees, it will feel
 * compelled to expand upon it before addressing other actions.
 * 
 * Finally, there are a few more rules applied to this:
 * - If a front-memory was previously set within the same run, forced action
 *   processing is skipped.
 * - If multiple actions can trigger, it will randomly select one based on
 *   how many inclusive keywords were matched.
 * - After a forced action has triggered, all other forced actions will
 *   have their cooldown increased to 5 if it is below that value.  This
 *   is to keep forced actions from triggering way too often and derailing
 *   the scene.
 */

const reKeywordFilter = /^([+-])(.+)$/;

// class ForcedAction extends MatchableEntry {
//   /**
//    * 
//    * @param {WorldInfoEntry} worldInfo 
//    * @param {string} cooldown 
//    * @param {string} keywords 
//    */
//   constructor(worldInfo, cooldown, keywords) {
//     const include = [], exclude = [];
//     for (const keyword of keywords.split(";")) {
//       const match = reKeywordFilter.exec(keyword.trim());
//       if (!match) continue;

//       const [, mode, key] = match;
//       if (mode === "-") exclude.push(key);
//       else include.push(key);
//     }
//     super(worldInfo, include, exclude);
//     this.cooldown = parseInt(cooldown);
//     this.id = String(worldInfo.id);
//   }

//   static reMatcher = /\$force\((\d+)\)(\:(.+))?$/

//   /**
//    * @param {WorldInfoEntry} worldInfo
//    * @returns {ForcedAction | undefined}
//    */
//   static createFrom(worldInfo) {
//     const match = this.reMatcher.exec(worldInfo.keys);
//     if (!match) return undefined;
//     const [, cooldown, keywords] = match;
//     return new this(worldInfo, cooldown, keywords);
//   }
// }

// /** @type {ModifierExecutionFn} */
// function $$forcedActionInjector(text) {
//   if (state.memory.frontMemory) return undefined;

//   const { $$forcedActions = {} } = state;
//   /** @type {Record<string, ForcedAction>} */
//   const actionsMap = {};
//   /** @type {ForcedAction[]} */
//   const availableActions = [];
  
//   for (const wi of worldInfo) {
//     const curAction = ForcedAction.createFrom(wi);
//     if (!curAction) continue;
//     if (Number.isNaN(curAction.cooldown)) continue;
//     if (curAction.cooldown < 0) continue;
//     actionsMap[curAction.id] = curAction;
//   }

//   // Create actions missing from the current state.
//   // Set the turn that their cooldown expires.
//   for (const actionId of Object.keys(actionsMap)) {
//     if (actionId in $$forcedActions) continue;
//     const action = actionsMap[actionId];
//     $$forcedActions[actionId] = info.actionCount + action.cooldown;
//   }

//   // Check for actions that are ready to go.
//   for (const actionId of Object.keys($$forcedActions)) {
//     const expiration = Number($$forcedActions[actionId]);
//     const action = actionsMap[actionId];

//     // There is no guarantee this action still exists.
//     // If it is missing, drop it from the state.
//     if (!action) {
//       delete $$forcedActions[actionId];
//       continue;
//     }

//     // Has this action cooled down?
//     if (expiration > info.actionCount) continue;

//     availableActions.push(action);
//   }

//   // Perform checks on the actions and select one for use.
//   /** @type {ForcedAction | null} */
//   let selectedAction = null;
//   if (availableActions.length > 0) {
//     const actRoulette = new Roulette();
//     const historyText = [...history.map(getText), text];

//     for (const action of availableActions) {
//       // Pass on actions for which the history has excluded words.
//       if (action.hasExcludedWords($$matchCounter, historyText)) continue;

//       if (action.include.length === 0) {
//         // If they have no inclusions, use the cooldown as a weight.
//         actRoulette.push(action.cooldown, action);
//       }
//       else {
//         // Weigh matching actions based on count of occurances.
//         const count = action.occurancesIn($$matchCounter, historyText);
//         if (count > 0) actRoulette.push(count, action);
//       }
//     }

//     if (actRoulette.count > 0)
//       selectedAction = actRoulette.pick();
//   }

//   // Activate the action and clean up.
//   if (selectedAction) {
//     const actionId = selectedAction.id;
//     for (const otherId of Object.keys($$forcedActions))
//       if (otherId !== actionId)
//         $$forcedActions[otherId] += 5;
//     state.memory.frontMemory = `\n${selectedAction.text.trim()}`;
//     $$forcedActions[actionId] = info.actionCount + Math.max(5, selectedAction.cooldown);
//   }

//   state.$$forcedActions = $$forcedActions;

//   return undefined;
// }

/* Exports. */

/** @type {ModifierExecutionFn[]} */
const $$inputModifiers = [
  $$resetState,
  $$matchCommands,
  ...$$worldStateInjector.pre,
  ...$$worldStateInjector.exec,
  ...$$worldStateInjector.post,
  //$$dynamicAuthor,
  //$$worldStateInjector,
  $$playerMemoryInjector,
  //$$forcedActionInjector,
];

/* Main modifier. */

/** @type {ModifierFn} */
const modifier = (text) => {
  let modifiedText = text;
  for (const im of $$inputModifiers) {
    const result = im(text);
    if (result) {
      modifiedText = result.text;
      if (result.stop)
        return { text: modifiedText, stop: true };
    }
  }

  return { text: modifiedText };
}

// Don't modify this part
modifier(text);