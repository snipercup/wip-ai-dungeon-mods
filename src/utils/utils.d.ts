type TransformFn<TIn, TOut> = (value: TIn) => TOut;
type PredicateFn<T> = (value: T) => boolean;
type TypeGuardPredicateFn<T, U> = (value: T) => value is U;
type TapFn<TValue> = (value: TValue) => unknown;

type Chainable<TEl, TIter extends Iterable<TEl>> = TIter;
type ElementOf<T> = T extends Iterable<infer TEl> ? TEl : never;

type Flattenable<T>
  = T extends string ? string
  : T extends Iterable<infer TEl> ? TEl
  : T;
type FlatElementOf<T> = T extends Iterable<infer TEl> ? Flattenable<TEl> : never;

interface ChainComposition<TIterIn extends Iterable<any>> {
  /** Transforms each element. */
  map<TOut>(xformFn: TransformFn<ElementOf<TIterIn>, TOut>): ChainComposition<Iterable<TOut>>;
  /** Flattens an iterable of iterables by one level. */
  flatten(): ChainComposition<Iterable<FlatElementOf<TIterIn>>>;
  /** Removes falsey values from the iterable and refines the element's type to remove `undefined` and `null`. */
  filter(predicateFn: BooleanConstructor): ChainComposition<Iterable<Exclude<ElementOf<TIterIn>, null | undefined>>>;
  /** Filters to a specific type, as described by the type-guard predicate. */
  filter<TOut>(predicateFn: TypeGuardPredicateFn<ElementOf<TIterIn>, TOut>): ChainComposition<Iterable<TOut>>;
  /** Filters to those elements that pass a predicate function. */
  filter(predicateFn: PredicateFn<ElementOf<TIterIn>>): ChainComposition<Iterable<ElementOf<TIterIn>>>;
  /** Concatenates the given values and/or iterables after the current iterable. */
  concat<TEl>(...others: (TEl | Iterable<TEl>)[]): ChainComposition<Iterable<ElementOf<TIterIn> | TEl>>;
  /** Transforms the iterable into a different iterable. */
  thru<TIterOut extends Iterable<any>>(xformFn: TransformFn<TIterIn, TIterOut>): ChainComposition<TIterOut>;
  /** Calls the given function with each value, but does not alter the iterable. */
  tap(tapFn: TapFn<ElementOf<TIterIn>>): ChainComposition<Iterable<ElementOf<TIterIn>>>;
  /** Transforms the iterable into any kind of value, ending the chain. */
  value<TOut>(xformFn: TransformFn<TIterIn, TOut>): TOut;
  /** Ends the chain and produces the resulting iterable. */
  value(): TIterIn;
  /** Ends the chain and materializes the iterable as an array. */
  toArray(): Array<ElementOf<TIterIn>>;
  /** Materializes the iterable for side-effects.  Helpful if you just wanna `tap` that. */
  exec(): void;
}

interface ChainingFn {
  /** Creates a chain from the given iterable. */
  <TIter extends Iterable<any>>(iterable: TIter): ChainComposition<TIter>;
  /** Creates an empty iterable chain. */
  (): ChainComposition<[]>
}