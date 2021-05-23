namespace Stemming {
  type HistoryKey = `History(${number})`;
  type WorldInfoKey = `WorldInfo(${string})`;
  type OtherKeys = "PlayerMemory" | "Summary" | "FrontMemory";

  type AnyKey = HistoryKey | WorldInfoKey | OtherKeys;

  interface Storage {
    stemMap: Map<AnyKey, string>;
    corpus: import("tiny-tfidf").Corpus;
  }

  interface EntryWithStemKey {
    stemKey: AnyKey;
  }

  interface EntryWithWorldInfo {
    worldInfo: WorldInfoEntry;
  }

  type ComparableEntry = AnyKey | EntryWithStemKey | EntryWithWorldInfo | number;
}

declare module "aid-bundler/src/aidData" {
  interface AIDData {
    stemmingData: Stemming.Storage;
  }
}