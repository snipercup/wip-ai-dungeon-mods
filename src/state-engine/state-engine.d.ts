type MatchableEntry = import("./MatchableEntry").MatchableEntry;
type StateEngineEntry = import("./StateEngineEntry").StateEngineEntry;

interface StateModule {
  pre?: BundledModifierFn[];
  exec?: BundledModifierFn[];
  post?: BundledModifierFn[];
}

interface StateEngineData {
  /**
   * The ID of the `WorldInfoEntry` this data belongs to.
   */
  infoId: WorldInfoEntry["id"];
  /**
   * The original `keys` of the `WorldInfoEntry` this data was created from.
   * Can be used to check to see if it requires recalculation.
   */
  infoKey: WorldInfoEntry["keys"];
  /**
   * The key of this entry.  Common types:
   * - `Player` - For a player's information; high-priority.
   * - `NPC` - For an NPC's information.
   * - `Location` - For the current location of the scene; high-priority.
   * - `Lore` - For general knowledge of the world.
   * - `State` - For present knowledge of the world and its characters; high-priority.
   */
  type: string;
  /**
   * An user-given identifier.  Will be `null` if it was not given one or is otherwise
   * not applicable to the `type`.
   */
  key: string | null;
  /**
   * An array of types, referencing other entries.
   * These must match for this entry to match.
   */
  relations: string[];
  /**
   * Keywords that, when found in the text, will cause this entry to match.
   */
  include: string[];
  /**
   * Keywords that, when found in the text, will prevent this entry from
   * matching, even if an entry from `include` matches.
   */
  exclude: string[];
}

type StateAssociations = Map<AssociationSources, Set<StateEngineEntry["infoId"]>>;

interface GetAssociationSetFn {
  (source: AssociationSources, create: true): Set<StateEngineEntry["infoId"]>;
  (source: AssociationSources, create?: false): Maybe<Set<StateEngineEntry["infoId"]>>;
}

interface StateValidatorFn {
  (stateData: StateEngineData): string[];
}

interface StateModifierFn {
  (stateData: StateEngineData, allStates: StateEngineData[]): StateEngineData;
}

type AssociationSources = "implicit" | "implicitRef" | "playerMemory" | "authorsNote" | "frontMemory" | number;
type UsedKeysMap = Map<number, Set<string>>;
type AssociationHelperResult
  = [MatchableEntry, "implicit"]
  | [MatchableEntry, "implicitRef", StateEngineEntry]
  | [MatchableEntry, "authorsNote"]
  | [MatchableEntry, "frontMemory"]
  | [MatchableEntry, "playerMemory", string]
  | [MatchableEntry, number, HistoryEntry];

interface StateAssociationFn {
  (matcher: MatchableEntry, source: "implicit"): Maybe<boolean>;
  (matcher: MatchableEntry, source: "implicitRef", stateData: StateEngineEntry): Maybe<boolean>;
  (matcher: MatchableEntry, source: "authorsNote"): Maybe<boolean>;
  (matcher: MatchableEntry, source: "frontMemory"): Maybe<boolean>;
  (matcher: MatchableEntry, source: "playerMemory", text: string): Maybe<boolean>;
  (matcher: MatchableEntry, source: number, historyEntry: HistoryEntry, usedKeys: UsedKeysMap): Maybe<boolean>;
}

// TypeScript still can't do this itself!?
type StateAssociationBaseFn = (
  matcher: MatchableEntry,
  source: AssociationSources,
  entry?: StateEngineEntry | HistoryEntry | string,
  usedKeys?: UsedKeysMap
) => Maybe<boolean>;

type PreRuleIteratorResult = [otherEntry: StateEngineEntry, source: AssociationSources];
type PreRuleIterator = () => Iterable<PreRuleIteratorResult>;
interface PreRuleIterators {
  before: PreRuleIterator;
  current: PreRuleIterator;
  after: PreRuleIterator;
  getFor(source: AssociationSources): Iterable<PreRuleIteratorResult>;
}

interface StatePreRuleFn {
  /**
   * @returns `true` if the state should be retained; `false` to remove it.
   */
  (matcher: MatchableEntry, source: AssociationSources, neighbors: PreRuleIterators): Maybe<boolean>;
}

interface StateValuatorFn {
  /**
   * @returns One of:
   * - `number` - The base value to apply to the default calculation.
   * - `number[]` - A set of values that will be multiplied together to create
   *   a score; this is what the default valuator does under the hood.  If
   *   you want it to use a specific score, just return something like `[calcScore()]`.
   */
  (matcher: MatchableEntry, source: AssociationSources, entry: StateEngineEntry | HistoryEntry | string): Maybe<number | number[]>;
  (matcher: MatchableEntry, source: AssociationSources, entry?: unknown): Maybe<number | number[]>;
}

// TypeScript still can't do this itself!?
type StateValuatorBaseFn = (
  matcher: MatchableEntry,
  source: AssociationSources,
  entry?: StateEngineEntry | HistoryEntry | string
) => Maybe<number | number[]>;

type ScoresMap = Map<AssociationSources, Map<StateEngineEntry["infoId"], number>>;
type PostRuleIteratorResult = [...PreRuleIteratorResult, score: number];
type PostRuleIterator = () => Iterable<PostRuleIteratorResult>;
interface PostRuleIterators {
  getFor(source: AssociationSources): Iterable<PostRuleIteratorResult>;
  before: PostRuleIterator;
  current: PostRuleIterator;
  after: PostRuleIterator;
  selected: PostRuleIterator;
}

interface StatePostRuleFn {
  /**
   * @returns `true` if the state should be retained; `false` to remove it.
   */
  (matcher: MatchableEntry, source: AssociationSources, score: number, neighbors: PostRuleIterators): Maybe<boolean>;
}

interface StateProcessors {
  validator?: StateValidatorFn;
  modifier?: StateModifierFn;
  associator?: StateAssociationFn;
  preRules?: StatePreRuleFn;
  valuator?: StateValuatorFn;
  postRules?: StatePostRuleFn;
}

interface StateDefinition extends StateProcessors {
  priority?: number;
}

type AssertStateProcessor<TProc extends keyof StateProcessors>
  = Required<StateProcessors>[TProc];

interface StateEngineCacheData {
  infoId: StateEngineData["infoId"];
  score: number;
  priority: number | null;
  source: AssociationSources;
}

interface StateDataCache {
  /** Entries for `state.memory.context` injection. */
  forContextMemory: StateEngineCacheData[];
  /** An entry for `state.memory.frontMemory` injection. */
  forFrontMemory: StateEngineCacheData | null;
  /** An entry for `state.memory.authorsNote` injection. */
  forAuthorsNote: StateEngineCacheData | null;
  /**
   * Entries associated with `history` entries.
   * - `key` - An offset from the current history entry.
   *   - A value of `0` indicates the current `text`.
   *   - A value like `1` indicates `history[history.length - 1]`.
   * - `value` - A `StateEngineEntry` ID.
   */
  forHistory: Record<number, StateEngineCacheData>;
};

/** A generic interface for sortable things. */
interface SortableEntry {
  text?: string;
  key?: StateEngineData["key"];
  relations?: StateEngineData["relations"];
  priority?: StateEngineCacheData["priority"];
  score?: StateEngineCacheData["score"];
}

/** An interface describing the sorting position of an entry. */
interface WithOrdering {
  order: number;
}

declare interface GameState {
  /**
   * A cache of pre-processed `StateEngineData` entries.
   */
  $$stateDataCache?: Record<WorldInfoEntry["id"], StateEngineData>;
}

declare module "aid-bundler/src/aidData" {
  interface AIDData {
    matchCounter: (str: string, regex: RegExp) => number;
  }
}