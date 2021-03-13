interface ContextModeModule {
  name: string;
  input?: BundledModifierFn;
  context?: BundledModifierFn;
  output?: BundledModifierFn;
}

interface ContextData extends StateEngineData {
  worldInfo: WorldInfoEntry;
  score: StateEngineCacheData["score"];
  priority: StateEngineCacheData["priority"];
  text: string;
}

declare interface GameState {
  $$contextMode?: string;
}