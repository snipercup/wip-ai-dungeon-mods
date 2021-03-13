type TransformFn<TIn, TOut> = (value: TIn) => TOut;
type PredicateFn<T> = (value: T) => boolean;
type TypeGuardPredicateFn<T, U> = (value: T | U) => value is U;
type TapFn<TValue> = (value: TValue) => unknown;

type Chainable<TEl, TIter extends Iterable<TEl>> = TIter;
type ElementOf<T> = T extends Iterable<infer TEl> ? TEl : never;

interface ChainComposition<TIterIn extends Iterable<any>> {
  map<TOut>(xformFn: TransformFn<ElementOf<TIterIn>, TOut>): ChainComposition<Iterable<TOut>>;
  filter(predicateFn: BooleanConstructor): ChainComposition<Iterable<Exclude<ElementOf<TIterIn>, null | undefined>>>;
  filter<TOut>(predicateFn: TypeGuardPredicateFn<ElementOf<TIterIn>, TOut>): ChainComposition<Iterable<TOut>>;
  filter(predicateFn: PredicateFn<ElementOf<TIterIn>>): ChainComposition<Iterable<ElementOf<TIterIn>>>;
  concat<TEl>(...others: (TEl | Iterable<TEl>)[]): ChainComposition<Iterable<ElementOf<TIterIn> | TEl>>;
  thru<TIterOut extends Iterable<any>>(xformFn: TransformFn<TIterIn, TIterOut>): ChainComposition<TIterOut>;
  tap(tapFn: TapFn<ElementOf<TIterIn>>): ChainComposition<Iterable<ElementOf<TIterIn>>>;
  value<TOut>(xformFn: TransformFn<TIterIn, TOut>): TOut;
  value(): TIterIn;
}

interface ChainingFn {
  /** Creates a chain from the given iterable. */
  <TIter extends Iterable<any>>(iterable: TIter): ChainComposition<TIter>;
  /** Creates an empty iterable chain. */
  (): ChainComposition<[]>
}