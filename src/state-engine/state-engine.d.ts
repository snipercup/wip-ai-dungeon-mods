type MatchableEntry = import("./MatchableEntry").MatchableEntry;
type StateEngineEntry = import("./StateEngineEntry").StateEngineEntry;

interface StateModule {
  pre?: BundledModifierFn[];
  exec?: BundledModifierFn[];
  post?: BundledModifierFn[];
}

interface StateEngineEntryClass {
  new (...args: any[]): StateEngineEntry;
  forType: (typeof import("./StateEngineEntry").StateEngineEntry)["forType"];
  produceEntries: (typeof import("./StateEngineEntry").StateEngineEntry)["produceEntries"];
}

interface PatternMatcher<T> {
  (text: Maybe<string>): T | undefined;
}

type KeywordTypes = "include" | "exclude";
interface KeywordDef<TType extends KeywordTypes> {
  type: TType;
  exactMatch: boolean;
  value: string;
}

type RelationTypes = "allOf" | "atLeastOne" | "negated";
interface RelationDef<TType extends RelationTypes> {
  type: TType;
  key: string;
}

type AnyKeywordDef = KeywordDef<KeywordTypes>;
type AnyRelationDef = RelationDef<RelationTypes>;
type AnyMatcherDef = AnyKeywordDef | AnyRelationDef;

interface StateEngineData {
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
   * The ID given to this entry.
   */
  entryId: string;
  /**
   * Optional; provide to store the entry's text, if the entry is dynamic.
   */
  text?: string;
  /**
   * A list of user-given identifiers.  Will be empty if it was not given one or is
   * otherwise not applicable to the `type`.  The first element is typically treated
   * like a name for the instance.
   */
  keys: string[];
  /**
   * An array of relation configuration objects.
   */
  relations: AnyRelationDef[];
  /**
   * An array of keyword configuration objects.
   */
  keywords: AnyKeywordDef[];
}

interface EngineDataForWorldInfo extends StateEngineData {
  /**
   * Indicates that this entry is associated with a world-info entry.
   */
  forWorldInfo: boolean;
  /**
   * The original `keys` of the `WorldInfoEntry` this data was created from.
   * Can be used to check to see if it requires recalculation.
   */
  infoKey: WorldInfoEntry["keys"];
}

interface StateDataForModifier extends StateEngineData {
  keys: Set<string>;
}

type StateAssociations = Map<AssociationSources, Set<StateEngineEntry["entryId"]>>;

interface GetAssociationSetFn {
  (source: AssociationSources, create: true): Set<StateEngineEntry["entryId"]>;
  (source: AssociationSources, create?: false): Maybe<Set<StateEngineEntry["entryId"]>>;
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

type ScoresMap = Map<AssociationSources, Map<StateEngineEntry["entryId"], number>>;
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
  entryId: StateEngineData["entryId"];
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
  keys?: Set<string>;
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
  $$stateDataCache?: Record<StateEngineData["entryId"], StateEngineData & Record<string, unknown>>;
}

declare module "aid-bundler/src/aidData" {
  interface AIDData {
    stateEngineContext: import("./core/types").Context;
  }
}