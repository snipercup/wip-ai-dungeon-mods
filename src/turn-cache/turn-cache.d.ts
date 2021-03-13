type IntrinsicValueType = string | number | boolean | null | undefined;
type BasicObject = Record<string | number, any>;
type CachableType = IntrinsicValueType | BasicObject;

type TurnCacheData<T extends CachableType> = Record<number, T>;
type NamedCacheData<T extends CachableType> = Record<string, TurnCacheData<T>>;

declare interface GameState {
  /** State storage for `TurnCache`. */
  $$turnCache?: NamedCacheData<any>;
}