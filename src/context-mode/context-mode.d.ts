interface ContextModeModule {
  name: string;
  input?: BundledModifierFn;
  context?: BundledModifierFn;
  output?: BundledModifierFn;
}

interface ContextData extends StateEngineData, StateEngineCacheData {
  worldInfo: WorldInfoEntry;
  text: string;
}

declare interface GameState {
  $$contextMode?: string;
}