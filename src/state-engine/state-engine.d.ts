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

interface StateDataForModifier extends StateEngineData {
  relations: Set<string>;
  include: Set<string>;
  exclude: Set<string>;
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

type UsedKeysMap = Map<number, Set<string>>;

interface AssociationParamTypes {
  "implicit": { source: "implicit" };
  "implicitRef": { source: "implicitRef", entry: StateEngineEntry };
  "playerMemory": { source: "playerMemory", entry: string };
  "authorsNote": { source: "authorsNote" };
  "frontMemory": { source: "frontMemory" };
  "history": { source: number, entry: HistoryEntry, usedKeys: UsedKeysMap };
}

type AssociationTargets = keyof AssociationParamTypes;
type AssociationParams = AssociationParamTypes[AssociationTargets];
type AssociationSources = AssociationParams["source"];
// There's no reliable way to make TS generate this automatically.
type FlatAssociationParams = { source: any, entry?: any, usedKeys?: any };

// This should be inlined into `AssociationParamsFor`, but TypeScript's type-system is garbage.
type AssociationParamsFromTargets<TTargets extends Array<AssociationTargets> | null>
  = TTargets extends Array<infer TKey>
    ? TKey extends AssociationTargets ? AssociationParamTypes[TKey]
    : never
  : AssociationParamTypes["implicitRef" | "playerMemory" | "history"];

type AssociationParamsFor<TEntry extends StateEngineEntry>
  = AssociationParamsFromTargets<TEntry["targetSources"]>;

type AssociationSourcesFor<TEntry extends StateEngineEntry>
  = AssociationParamsFor<TEntry>["source"];

type PreRuleIteratorResult = [otherEntry: StateEngineEntry, source: AssociationSources];
type PreRuleIterator = () => Iterable<PreRuleIteratorResult>;
interface PreRuleIterators {
  /** Gets all associations for the given source. */
  getFor(source: AssociationSources): Iterable<PreRuleIteratorResult>;
  /**
   * Gets all History associations before the current source.
   * Will be empty unless the current association is a history source.
   */
  before: PreRuleIterator;
  /** Gets all associations for the current source. */
  current: PreRuleIterator;
  /**
   * Gets all History associations after the current source.
   * Will be empty unless the current association is a history source.
   */
  after: PreRuleIterator;
}

type ScoresMap = Map<AssociationSources, Map<StateEngineEntry["infoId"], number>>;
type PostRuleIteratorResult = [...PreRuleIteratorResult, score: number];
type PostRuleIterator = () => Iterable<PostRuleIteratorResult>;
interface PostRuleIterators {
  /** Gets all associations for the given source. */
  getFor(source: AssociationSources): Iterable<PostRuleIteratorResult>;
  /**
   * Gets all History associations before the current source.
   * Will be empty unless the current association is a history source.
   */
  before: PostRuleIterator;
  /** Gets all associations for the current source. */
  current: PostRuleIterator;
  /**
   * Gets all History associations after the current source.
   * Will be empty unless the current association is a history source.
   */
  after: PostRuleIterator;
  /**
   * Gets the associations that have won the roulette and been selected, thus far.
   * 
   * You will not get selections from sources that have not yet been evaluated, so
   * if history source `2` is being evaluated, you can get the final selections
   * for `0` and `1` only.
   */
  selected: PostRuleIterator;
}

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
    stateEngineContext: import("./core/types").Context;
  }
}