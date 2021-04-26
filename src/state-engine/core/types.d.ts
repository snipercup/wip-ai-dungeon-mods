/// <reference path="../global.d.ts" />

export interface Context {
  matchCounter: (str: string, regex: RegExp) => number;
  theCache: import("../../turn-cache").WriteCache<StateDataCache>;
  entriesMap: Record<string, StateEngineEntry>;
  validationIssues: Map<string, string[]>;
  sortedStateMatchers: import("../MatchableEntry").MatchableEntry[];
  workingHistory: HistoryEntry[];
  stateAssociations: StateAssociations;
  scoresMap: ScoresMap;
}

export interface GetAssociationSet {
  (ctx: Context, source: AssociationSources, create: true): Set<StateEngineEntry["entryId"]>;
  (ctx: Context, source: AssociationSources, create?: false): Maybe<Set<StateEngineEntry["entryId"]>>;
}