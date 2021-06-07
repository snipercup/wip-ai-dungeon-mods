declare namespace console {
  function log(item: any);
}

declare interface Array<T> {
  filter(predicate: BooleanConstructor): Exclude<T, null | undefined>[];
}

declare interface HistoryEntry {
  text: string;
  type: "do" | "say" | "story" | "continue";
}

declare interface WorldInfoEntry {
  id: string;
  publicId: string;
  name: string | null;
  userId: string;
  type: string;
  generator: string;
  tagsString: string | null;
  keys: string;
  genre: string | null;
  attributes: unknown;
  entry: string | null;
  description: string | null;
  favorite: boolean;
  tags: string[];
  factionName: string | null;
  hidden: boolean;
}

declare interface QuestInfo {
  id: string,
  quest: string;
  active: boolean;
  completed: boolean;
}

declare interface ModifierResult {
  text: string;
  stop?: boolean;
}

declare interface ModifierFn {
  (text: string): ModifierResult
}

declare interface MultiplayerMessage {
  text: string;
  visibleTo: string[];
}

declare interface DisplayStat {
  key: string;
  value: string;
  color: string;
}

declare interface StatEntry {
  level: number;
  cost: number;
}

declare interface StatState {
  stats: Record<string, StatEntry>;
  statPoints: number;
}

declare interface InventoryItem {
  name: string;
  quantity: number;
}

declare interface PlayerInfo {
  /** The player's name.  May be `null` at the start of the game. */
  name: string | null;
}

declare type SkillDictionary = Record<string, number>;

declare type EvaluationBot
  = "KillBot" | "JudgeBot" | "EmpathyBot" | "SuccessBot" | "SantaBot"
  | "GoblinBot" | "KittenBot" | "SpaceLootBot" | "DCStatDifficultyBot"
  | "HungerBot" | "SimplePossibilityBot";

declare interface GameMemory {
  context?: string;
  frontMemory?: string;
  authorsNote?: string;
}

declare interface GameState {
  memory: GameMemory;
  message?: string | MultiplayerMessage;
  displayStats?: DisplayStat[];
  stats?: StatState;
  inventory?: InventoryItem[];
  evaluationBot?: EvaluationBot;
  inputBot?: EvaluationBot;
  skills?: SkillDictionary;
  disableRandomSkill?: boolean;
  skillPoints?: number;

  /* Begin custom additions! */

  /**
   * State storage for the forced actions system.  A map from the
   * `StateEngineData` ID for the action to the turn it should next
   * evaluate on.
   */
  $$forcedActions?: Record<StateEngineData["entryId"], number>;
};

declare interface GameInfo {
  readonly actionCount: number;
  readonly characters: ReadonlyArray<readonly PlayerInfo>;
  readonly memoryLength: number;
  readonly maxChars: number;
  readonly evaluation: unknown;
  readonly inputEvaluation: unknown;
}

/*
declare const info: GameInfo;
declare const state: GameState;
declare const memory: string;
declare const history: ReadonlyArray<readonly HistoryEntry>;
declare const worldInfo: ReadonlyArray<readonly WorldInfoEntry>;
declare const quests: Array<QuestInfo>;
*/

declare function addWorldEntry(keys: string, entry: string, hidden: boolean = false);
declare function removeWorldEntry(index: number);
declare function updateWorldEntry(index: number, keys: string, entry: string, hidden: boolean = false);

type Maybe<T> = T | null | undefined;
type MaybeArray<T> = T | T[];

declare module "aid-bundler/src/aidData" {
  class AIDData {
    constructor (text: string, state: GameState, info: GameInfo, worldEntries: Readonly<WorldInfoEntry>[], history: Readonly<HistoryEntry>[], memory: string): AIDData;

    /** The current text; mutable and shared by all modifiers. */
    text: string;

    /** The original text, provided by the system. */
    readonly givenText: string;

    /**
     * The player memory.  Can be altered by other plugins, but assignments to this
     * property cannot actually change what is shown in the player's "Pin".
     */
    playerMemory: string;

    /** The original player memory, unalterable by other plugins. */
    readonly givenPlayerMemory: string;

    /** The game's mutable state object. */
    state: GameState;

    /** The game's informational object. */
    info: GameInfo;

    /** The `WorldInfo` entries set by the player and scenario. */
    worldEntries: ReadonlyArray<readonly WorldInfoEntry>;

    /** The list of prior actions by both the player and AI. */
    history: ReadonlyArray<readonly HistoryEntry>;

    /** The current processing phase. */
    phase: "input" | "context" | "output";

    /**
     * Whether to allow the AI to continue; corresponds to the standard `stop` in
     * the vanilla modifier's result.
     */
    useAI: boolean;

    finalizeOutput(): ModifierResult;

    /** Get or set a message to display to the player. */
    message: string;

    /** The current number of actions, between both the player and AI. */
    get actionCount(): GameInfo["actionCount"];

    /** A list of player-characters and their information. */
    get characters(): GameInfo["characters"];

    /** When in the context modifier, the length of the memory portion of the text. */
    get memoryLength(): GameInfo["memoryLength"];

    /** When in the context modifier, the maximum length the context may be. */
    get maxChars(): GameInfo["maxChars"];
  }
}

declare interface BundledModifierFn {
  (data: import("aid-bundler/src/aidData").AIDData): void;
}

declare module "aid-bundler/src/commandHandler" {
  import type { AIDData } from "aid-bundler/src/aidData";

  interface CommandHandlerFn {
    (data: AIDData, args: string[]): void;
  }

  class Command {
    constructor(name: string, handler: CommandHandlerFn): Command;
  }
}

declare module "aid-bundler" {
  import { Command } from "aid-bundler/src/commandHandler";

  class Plugin {
    constructor(name: string, inputMod?: BundledModifierFn, contextMod?: BundledModifierFn, outputMod?: BundledModifierFn);
    name: string;
    inputModifier: BundledModifierFn;
    contextModifier: BundledModifierFn;
    outputModifier: BundledModifierFn;
  }

  const Pipeline: typeof import("../node_modules/aid-bundler/index.js").Pipeline;
  const Command: typeof import("aid-bundler/src/commandHandler").Command;

  export { Plugin, Pipeline, Command };
}