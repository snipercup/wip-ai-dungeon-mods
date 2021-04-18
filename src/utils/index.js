/// <reference path="./utils.d.ts" />

/**
 * IIFE helper.
 * 
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
module.exports.dew = (fn) => fn();

/**
 * @param {any} value 
 * @returns {any}
 */
module.exports.shutUpTS = (value) => value;

/**
 * Identity function.
 * 
 * @template T
 * @param {T} input 
 * @returns {T}
 */
module.exports.ident = (input) => input;

/**
 * Creates a strongly-typed two-element tuple.
 * 
 * @template TA, TB
 * @param {TA} a
 * @param {TB} b
 * @returns {[TA, TB]}
 */
module.exports.tuple2 = (a, b) => [a, b];

/**
 * Creates a strongly-typed three-element tuple.
 * 
 * @template TA, TB, TC
 * @param {TA} a
 * @param {TB} b
 * @param {TC} c
 * @returns {[TA, TB, TC]}
 */
module.exports.tuple3 = (a, b, c) => [a, b, c];

/**
 * Checks that a value is not `null` or `undefined`.
 * 
 * @template T
 * @param {T} value 
 * @returns {value is Exclude<T, null | undefined>}
 */
module.exports.isInstance = (value) => value != null;

/**
 * Tests if something is iterable.  This will include strings, which indeed,
 * are iterable.
 * 
 * @param {any} value 
 * @returns {value is Iterable<any>}
 */
module.exports.hasIterator = (value) =>
  value != null && typeof value === "object" && Symbol.iterator in value;

/**
 * Creates an object from key-value-pairs.
 * 
 * @template {string | number} TKey
 * @template TValue
 * @param {Iterable<[TKey, TValue]>} kvps
 * @returns {Record<TKey, TValue>}
 */
module.exports.fromPairs = (kvps) => {
  /** @type {any} Oh, shove off TS. */
  const result = {};
  for (const [k, v] of kvps) result[k] = v;
  return result;
};

/**
 * Creates an iterable that yields the key-value pairs of an object.
 * 
 * @template {string | number} TKey
 * @template TValue
 * @param {Maybe<Record<TKey, TValue>>} obj
 * @returns {Iterable<[TKey, TValue]>} 
 */
module.exports.toPairs = function*(obj) {
  if (obj == null) return;
  for(const key of Object.keys(obj)) {
    // @ts-ignore - `Object.keys` is too dumb.
    yield module.exports.tuple2(key, obj[key]);
  }
};

/**
 * Applies a transformation function to the values of an object.
 * 
 * @template {string | number} TKey
 * @template TIn
 * @template TOut
 * @param {Maybe<Record<TKey, TIn>>} obj
 * @param {(value: TIn, key: TKey) => TOut} xformFn
 * @returns {Record<TKey, TOut>} 
 */
module.exports.mapValues = function(obj, xformFn) {
  /** @type {any} */
  const newObj = {};
  for (const [key, value] of module.exports.toPairs(obj))
    newObj[key] = xformFn(value, key);

  return newObj;
};

/**
 * Transforms an iterable with the given function, yielding each result.
 * 
 * @template T
 * @template U
 * @param {Iterable<T>} iterable
 * @param {TransformFn<T, Iterable<U>>} transformFn
 * @returns {Iterable<U>}
 */
module.exports.flatMap = function* (iterable, transformFn) {
  for (const value of iterable) yield* transformFn(value);
};

/**
 * Flattens the given iterable.  If the iterable contains strings, which
 * are themselves iterable, they will be yielded as-is, without flattening them.
 * 
 * @template {Flattenable<any>} T
 * @param {Iterable<T>} iterable
 * @returns {Iterable<Flattenable<T>>}
 */
module.exports.flatten = function* (iterable) {
  for (const value of iterable) {
    // @ts-ignore - We pass out non-iterables, as they are.
    if (!module.exports.hasIterator(value)) yield value;
    // @ts-ignore - We don't flatten strings.
    else if (typeof value === "string") yield value;
    // And now, do a flatten.
    else yield* value;
  }
};

/**
 * Iterates over an array, yielding the current index and item.
 * 
 * @template T
 * @param {T[]} arr
 * @returns {Iterable<[number, T]>}
 */
module.exports.iterArray = function* (arr) {
  for (let i = 0, lim = arr.length; i < lim; i++)
    yield [i, arr[i]];
};

/**
 * Yields iterables with a number representing their position.  For arrays,
 * this is very similar to a for loop, but you don't increment the index
 * yourself.
 * 
 * @template T
 * @param {Iterable<T>} iter
 * @returns {Iterable<[number, T]>}
 */
module.exports.iterPosition = function* (iter) {
  if (Array.isArray(iter)) {
    yield* module.exports.iterArray(iter);
  }
  else {
    let i = 0;
    for (const item of iter) yield [i++, item];
  }
};

/**
 * Yields elements of an iterable in reverse order.  You can limit the
 * number of results yielded by providing `count`.
 * 
 * @template T
 * @param {Iterable<T>} arr
 * @param {number} [count]
 * @returns {Iterable<T>}
 */
 module.exports.iterReverse = function* (arr, count) {
  if (Array.isArray(arr)) {
    // Ensure `count` is between 0 and the number of items in the array.
    count = Math.max(0, Math.min(arr.length, count ?? arr.length));
    const lim = arr.length - count;
    for (let i = arr.length - 1; i >= lim; i--) yield arr[i];
  }
  else {
    // Either way we gotta cache the values so we can reverse them.
    yield* module.exports.iterReverse([...arr], count);
  }
};

/**
 * Creates an iterable that transforms values.
 * 
 * @template TIn
 * @template TOut
 * @param {Iterable<TIn>} iterable 
 * @param {TransformFn<TIn, TOut>} transformFn
 * @returns {Iterable<TOut>}
 */
module.exports.mapIter = function* (iterable, transformFn) {
  for (const value of iterable)
    yield transformFn(value);
};

/**
 * Creates an iterable that transforms values, and yields the result if it is
 * not `undefined`.
 * 
 * @template TIn
 * @template TOut
 * @param {Iterable<TIn>} iterable 
 * @param {CollectFn<TIn, TOut>} collectFn
 * @returns {Iterable<TOut>}
 */
module.exports.collectIter = function* (iterable, collectFn) {
  for (const value of iterable) {
    const result = collectFn(value);
    if (typeof result !== "undefined") yield result;
  }
};

/**
 * Filters the given iterable to those values that pass a predicate.
 * 
 * @template T
 * @param {Iterable<T>} iterable
 * @param {PredicateFn<T>} predicateFn
 * @returns {Iterable<T>}
 */
 module.exports.filterIter = function* (iterable, predicateFn) {
  for (const value of iterable)
    if (predicateFn(value))
      yield value;
};

/**
 * Creates an iterable that groups values based on a transformation function.
 * 
 * @template TValue
 * @template TKey
 * @param {Iterable<TValue>} iterable
 * @param {TransformFn<TValue, TKey>} transformFn
 * @returns {Iterable<[TKey, TValue[]]>}
 */
module.exports.groupBy = function* (iterable, transformFn) {
  /** @type {Map<TKey, TValue[]>} */
  const groups = new Map();
  for (const value of iterable) {
    const key = transformFn(value);
    if (key == null) continue;
    const theGroup = groups.get(key) ?? [];
    theGroup.push(value);
    groups.set(key, theGroup);
  }

  for (const group of groups) yield group;
};

/**
 * Creates an iterable that groups key-value-pairs when they share the same key.
 * 
 * @template TValue
 * @template TKey
 * @param {Iterable<[TKey, TValue]>} iterable
 * @returns {Iterable<[TKey, TValue[]]>}
 */
module.exports.partition = function* (iterable) {
  for (const [key, values] of module.exports.groupBy(iterable, ([key]) => key)) {
    const group = values.map(([, value]) => value);
    yield [key, group];
  }
};

/**
 * Concatenates multiple values and/or iterables together.  Does not iterate
 * on strings, however.
 * 
 * @template T
 * @param  {...(T | Iterable<T>)} others
 * @returns {Iterable<T>}
 */
module.exports.concat = function* (...others) {
  for (const value of others) {
    if (typeof value === "string") yield value;
    else if (module.exports.hasIterator(value)) yield* value;
    else yield value;
  }
};

/**
 * Inserts `value` between every element of `iterable`.
 * 
 * @template T
 * @param {T} value 
 * @param {Iterable<T>} iterable
 * @returns {Iterable<T>}
 */
module.exports.interweave = function* (value, iterable) {
  const iterator = iterable[Symbol.iterator]();
  let prevEl = iterator.next();
  while (!prevEl.done) {
    yield prevEl.value;
    prevEl = iterator.next();
    if (prevEl.done) return;
    yield value;
  }
};

/**
 * Calls the given function on each element of `iterable` and yields the
 * values, unchanged.
 * 
 * @template {Iterable<any>} TIter
 * @param {TIter} iterable 
 * @param {TapFn<ElementOf<TIter>>} tapFn
 * @returns {Iterable<ElementOf<TIter>>}
 */
module.exports.tapEach = function* (iterable, tapFn) {
  // Clone an array in case the reference may be mutated by the `tapFn`.
  const safedIterable = Array.isArray(iterable) ? [...iterable] : iterable;
  for (const value of safedIterable) {
    tapFn(value);
    yield value;
  }
};

/**
 * Calls the given function on an array materialized from `iterable` and
 * yields the same values, unchanged.
 * 
 * @template {Iterable<any>} TIter
 * @param {TIter} iterable 
 * @param {TapFn<Array<ElementOf<TIter>>>} tapFn
 * @returns {Iterable<ElementOf<TIter>>}
 */
 module.exports.tapAll = function* (iterable, tapFn) {
  // Materialize the iterable; we can't provide an iterable that is
  // currently being iterated.
  const materialized = [...iterable];
  tapFn(materialized);
  yield* materialized;
};

/** @type {ChainingFn} */
module.exports.chain = module.exports.dew(() => {
  const { mapIter, filterIter, collectIter, concat, tapEach, tapAll, flatten } = module.exports;
  // @ts-ignore - Should be checked.
  const chain = (iterable) => {
    iterable = iterable ?? [];
    /** @type {ChainComposition<any>} */
    const result = {
      // @ts-ignore - Fitting an overloaded method; TS can't handle it.
      map: (transformFn) => chain(mapIter(iterable, transformFn)),
      flatten: () => chain(flatten(iterable)),
      // @ts-ignore - Fitting an overloaded method; TS can't handle it.
      filter: (predicateFn) => chain(filterIter(iterable, predicateFn)),
      // @ts-ignore - Fitting an overloaded method; TS can't handle it.
      collect: (collectFn) => chain(collectIter(iterable, collectFn)),
      concat: (...others) => chain(concat(iterable, ...others)),
      thru: (transformFn) => chain(transformFn(iterable)),
      tap: (tapFn) => chain(tapEach(iterable, tapFn)),
      tapAll: (tapFn) => chain(tapAll(iterable, tapFn)),
      /** @param {TransformFn<any, any>} [xformFn] */
      value: (xformFn) => xformFn ? xformFn(iterable) : iterable,
      toArray: () => [...iterable],
      exec: () => { for (const _ of iterable); }
    };
    return result;
  };
  return chain;
});

/**
 * Memoizes a pure function that takes a single argument.  If you need to memoize more,
 * use currying to break the function down into separate arguments.
 * 
 * @template {(arg: any) => any} TFunction
 * @param {TFunction} fn
 * @returns {TFunction}
 */
module.exports.memoize = (fn) => {
  const store = new Map();

  // @ts-ignore - Shut up TS.
  return (arg) => {
    if (store.has(arg)) return store.get(arg);
    const result = fn(arg);
    store.set(arg, result);
    return result;
  };
};

/**
 * Default `lengthGetter` for `limitText`.
 * 
 * @param {unknown} value 
 * @returns {number}
 */
const getLength = (value) => module.exports.getText(value).length;

/**
 * Yields strings of things with a `text` property from the given iterable until
 * the text would exceed the given `maxLength`.
 * 
 * If `options.permissive` is:
 * - `true` - It will yield as much text as can fit.
 * - `false` - It will stop at the first text that cannot fit.
 * 
 * Does not yield empty strings and skips nullish values.
 * 
 * @template {Iterable<any>} TIter
 * @param {TIter} textIterable
 * The iterable to yield from.
 * @param {number} maxLength
 * The maximum amount of text to yield.
 * @param {Object} [options]
 * @param {(value: ElementOf<TIter>) => number} [options.lengthGetter]
 * A transformation function to obtain a length from the value.  By default, it will
 * attempt to convert it with `getText` and produce the length of the result.  Since
 * this function return `""` if it can't find any text, it will not yield those values.
 * @param {boolean} [options.permissive=false]
 * If set to `true`, text that exceeds the length will only be skipped, allowing the
 * search for a shorter string to be included instead.
 * @returns {Iterable<ElementOf<TIter>>}
 */
module.exports.limitText = function* (textIterable, maxLength, options) {
  const { lengthGetter = getLength, permissive = false } = options ?? {};
  const textIterator = textIterable[Symbol.iterator]();
  let lengthRemaining = maxLength;
  let next = textIterator.next();
  for (; !next.done; next = textIterator.next()) {
    const length = lengthGetter(next.value);
    if (length <= 0) continue;

    const nextLength = lengthRemaining - length;
    if (nextLength < 0) {
      if (!permissive) return;
    }
    else {
      yield next.value;
      lengthRemaining = nextLength;
    }
  }
};

/**
 * Makes a string safe to be used in a RegExp matcher.
 * 
 * @param {string} str 
 */
module.exports.escapeRegExp = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Counts the number of `regex` matches in `str`.
 * 
 * @param {string} str
 * @param {RegExp} regex
 * @returns {number}
 */
module.exports.countOccurences = (str, regex) => {
  return ((str || '').match(regex) || []).length;
};

/**
 * Returns the last `count` elements of `arr` in reverse order.
 * IE: last 2 of `[1, 2, 3, 4]` is `[4, 3]`.
 * 
 * @template T
 * @param {T[]} arr 
 * @param {number} [count]
 * @returns {T[]}
 */
module.exports.getFinal = (arr, count = 1) => {
  return [...module.exports.iterReverse(arr, count)];
};

/**
 * Culls elements from the start of `inputLines` such that when the array
 * is joined, it will be under `charLimit` length.  When `dropTail` is
 * `true`, it will cull from the end of the array, otherwise the start of it.
 * 
 * @param {number} charLimit 
 * @param {string[]} inputLines
 * @param {boolean} [dropTail]
 * @returns {string[]}
 */
module.exports.limitLength = (charLimit, inputLines, dropTail = true) => {
  /** @type {{ chars: number, lines: string[] }} */
  const state = { chars: -1, lines: [] };

  /** @type {(i: number) => boolean} */
  const iterFn = (i) => {
    const curLine = inputLines[i];
    const { chars } = state;
    const newChars = chars + curLine.length + 1;
    if (newChars > charLimit) return false;
    
    state.chars = newChars;
    state.lines.push(curLine);
    return true;
  };
  
  if (dropTail) {
    for (let i = 0, lim = inputLines.length; i < lim; i++)
      if (!iterFn(i)) break;
    return state.lines;
  }
  else {
    for (let i = inputLines.length - 1; i >= 0; i--)
      if (!iterFn(i)) break;
    return state.lines.reverse();
  }
};

/**
 * Function for `reduce` that sums things with a `length` property.
 * 
 * @param {number} acc
 * @param {string} str
 * @returns {number}
 */
module.exports.sumLength = (acc, str) => {
  return acc + str.length;
};

/**
 * Function that gets text from an object.
 * - If `item` has a `text` property that is a string, it returns that.
 * - If `item` is itself a string, it returns that.
 * - Otherwise, produces an empty-string.
 */
module.exports.getText = module.exports.dew(() => {
  /** @type {(item: any) => item is string} */
  const isString = (item) => typeof item === "string";

  /** @type {(item: any) => item is { text: string }} */
  const hasText = (item) => Boolean(item && "text" in item && isString(item.text));

  /**
   * @param {any} item
   * @returns {string} 
   */
  const impl = (item) => {
    const text
      = isString(item) ? item
      : hasText(item) ? item.text
      : undefined;
    return text || "";
  };

  return impl;
});

/**
 * Compiles three sets of string arrays such that they will be under `charLimit`
 * length when joined.  Will drop elements from `filler` first, then `heading`.
 * Returns a combined array with whatever wasn't cut.
 * 
 * @param {number} charLimit 
 * @param {string[]} heading
 * @param {string[]} filler
 * @param {string[]} priority
 * @returns {string[]}
 */
module.exports.foldLines = (charLimit, heading, filler, priority) => {
  const { sumLength, limitLength } = module.exports;
  const priorityLength = priority.reduce(sumLength, 1);
  const notFiller = heading.reduce(sumLength, 1) + priorityLength;
  const newFiller = limitLength(charLimit - notFiller, filler, false);
  const notHeading = newFiller.reduce(sumLength, 1) + priorityLength;
  const newHeading = limitLength(charLimit - notHeading, heading, true);
  return [...newHeading, ...newFiller, ...priority];
};

/**
 * Rolls a dice, D&D style.
 * 
 * @param {number} count
 * @param {number} sides
 * @returns {number}
 */
module.exports.rollDice = (count, sides) => {
  let result = 0;
  for (let i = 0; i < count; i++)
  result += Math.floor(Math.random() * sides) + 1;
  return result;
};