/// <reference path="./turn-cache.d.ts" />
const { shutUpTS } = require("../utils");
const { cloneFromStorage, cleanCache } = require("./utils");

const $name = Symbol("TurnCache.name");
const $turnStorage = Symbol("TurnCache.turnStorage");
const $fromTurn = Symbol("TurnCache.fromTurn");
const $forTurn = Symbol("TurnCache.forTurn");
const $isNew = Symbol("TurnCache.isNew");

/**
 * A read-only cache object.
 * 
 * @template {CachableType} TCache
 */
class _ReadCache {
  /**
   * @param {string} name 
   * @param {import("aid-bundler/src/aidData").AIDData} aidData
   * @param {boolean} loose
   */
   constructor(name, aidData, loose) {
    const { state, actionCount } = aidData;

    /** @type {NamedCacheData<TCache>} */
    const stateStorage = state.$$turnCache ?? {};
    /** @type {TurnCacheData<TCache> | undefined} */
    const localStorage = stateStorage[name];

    /** @type {[number, Maybe<TCache>]} */
    const [fromTurn, storage] = cloneFromStorage(localStorage, actionCount, loose);

    this[$name] = name;
    this[$fromTurn] = fromTurn;
    this[$turnStorage] = storage;

    // Ensure the state is setup.
    state.$$turnCache = stateStorage;
  }

  /**
   * Gets the name of this cache.
   */
  get name() { return this[$name]; }

  /**
   * Gets the turn's cache storage directly.  May be `undefined` if no
   * storage for the turn could be located.
   */
  get storage() { return this[$turnStorage]; }

  /**
   * Gets the turn number (AKA `info.actionCount`) this cache belongs to.
   * It may differ from `info.actionCount` when `loose` mode is active.
   */
  get fromTurn() { return this[$fromTurn]; }

  /**
   * Whether there is anything in this storage.  If `false`, the `storage`
   * property will return `undefined`.
   */
  get isReadable() { return this.storage != null; }
}

/**
 * A cache that always generates a new storage object.  It will entirely
 * replace any old storage for the turn when committed.
 * 
 * @template {CachableType} TCache
 */
class _WriteCache {
  /**
   * @param {string} name 
   * @param {import("aid-bundler/src/aidData").AIDData} data
   * @param {number} storageSize
   * @param {TCache} [source]
   */
  constructor(name, data, storageSize, source) {
    const { state, actionCount } = data;
    this.currentTurn = actionCount;
    /** @type {NamedCacheData<TCache>} */
    const stateStorage = state.$$turnCache ?? {};
    /** @type {TurnCacheData<Maybe<TCache>>} */
    const localStorage = stateStorage[name] ?? {};

    this[$name] = name;
    this[$forTurn] = actionCount;
    this[$isNew] = !source;

    /**
     * The current storage for this cache.  You are free to get and set this
     * as you please.  Whatever is in here when `commit` is called will be
     * stored.
     * 
     * You may also set it to `null` or `undefined` to delete the cache when
     * it next commits.
     * 
     * @type {Maybe<TCache>}
     */
    this.storage = source;

    /**
     * Commits the cache to the game's `state`.  Must be called in order to
     * persist any data.
     */
    this.commit = () => {
      localStorage[actionCount] = this.storage;
      const newStorage = cleanCache(localStorage, actionCount, storageSize);
      stateStorage[name] = newStorage;
    };

    // Ensure the state is setup.
    state.$$turnCache = stateStorage;
  }

  /**
   * Gets the name of this cache.
   */
  get name() { return this[$name]; }

  /**
   * Gets the turn number (AKA `info.actionCount`) this cache belongs to.
   * Will always be the current turn for writable caches.
   */
  get forTurn() { return this[$forTurn]; }

  /**
   * Whether there is anything in this storage.  Always `true` for writable
   * caches.
   */
  get isReadable() { return true; }

  /**
   * Indicates if this writable cache was initialized with data from pre-existing
   * storage.
   */
  get isNew() { return this[$isNew]; }
}

/**
 * A cache that can pull an existing storage from a current or prior turn,
 * and make alterations to that data.  When operating in `loose` mode, these
 * alterations will be saved to the current turn, even if the values were
 * sourced from a previous turn.
 * 
 * @template {CachableType} TCache
 * @extends {_WriteCache<TCache>}
 */
class _UpdateCache extends _WriteCache {
  /**
   * @param {string} name 
   * @param {import("aid-bundler/src/aidData").AIDData} data
   * @param {number} storageSize
   * @param {boolean} loose
   */
  constructor(name, data, storageSize, loose) {
    
    const { state, actionCount } = data;
    const localStorage = state.$$turnCache?.[name];
    const [fromTurn, storage] = cloneFromStorage(localStorage, actionCount, loose);

    super(name, data, storageSize, storage);

    this[$fromTurn] = fromTurn;
  }

  /**
   * Gets the turn number (AKA `info.actionCount`) the original data for this
   * cache was sourced from.  It may differ from `info.actionCount` when `loose`
   * mode is active.
   */
  get fromTurn() { return this[$fromTurn]; }
}

/**
 * Creates a read-only instance into the turn cache.
 * 
 * @template {CachableType} T
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * The current `AIDData`.
 * @param {string} name
 * The name of the cache to obtain.
 * @param {Object} [options]
 * Options to customize the cache behavior.
 * @param {boolean} [options.loose]
 * If `true`, a stored object from a previous turn will be pulled if an object
 * for the current turn is not available.
 * @returns {_ReadCache<T>}
 */
exports.forRead = (aidData, name, options) =>
  new _ReadCache(name, aidData, Boolean(options?.loose));

/**
 * Creates a fresh, new, writable storage for the turn cache.
 * 
 * @template {CachableType} T
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * The current `AIDData`.
 * @param {string} name
 * The name of the cache to obtain.
 * @param {Object} [options]
 * Options to customize the cache behavior.
 * @param {number} [options.storageSize]
 * How many objects across all turns should be retained when doing cache maintenance.
 * This does not define how many turns back it will store, but how many turns CAN
 * be stored; the storage can be sparse.
 * @returns {_WriteCache<T>}
 */
exports.forWrite = (aidData, name, options) =>
  new _WriteCache(name, aidData, options?.storageSize ?? 10);

/**
 * Creates writable storage for the current turn, reading in previous data and using
 * it as a source for a new storage.  If `loose` is true, it may source from another
 * turn, but it will only overwrite it if the source was for the current turn.
 * 
 * @template {CachableType} T
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * The current `AIDData`.
 * @param {string} name
 * The name of the cache to obtain.
 * @param {Object} [options]
 * Options to customize the cache behavior.
 * @param {number} [options.storageSize]
 * How many objects across all turns should be retained when doing cache maintenance.
 * This does not define how many turns back it will store, but how many turns CAN
 * be stored; the storage can be sparse.
 * @param {boolean} [options.loose]
 * If `true`, a stored object from a previous turn will be pulled as a source for
 * the new storage if an object for the current turn is not available.
 * @returns {_UpdateCache<T>}
 */
exports.forUpdate = (aidData, name, options) => {
  const { storageSize = 10, loose = false } = options ?? {};
  return new _UpdateCache(name, aidData, storageSize, loose);
};

/**
 * Destroys a cache, entirely.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * The current `AIDData`.
 * @param {string} name
 * The name of the cache to clear.
 */
exports.clearCache = (aidData, name) => {
  const { state } = aidData;
  if (!state.$$turnCache) return;
  if (!state.$$turnCache[name]) return;
  delete state.$$turnCache[name];
};

// Export the types; this is pretty dumb for TS' JSDoc support.

/**
 * @template {CachableType} T
 * @typedef {_ReadCache<T>} ReadCache
 */

/**
 * @template {CachableType} T
 * @typedef {_WriteCache<T>} WriteCache
 */

/**
 * @template {CachableType} T
 * @typedef {_UpdateCache<T>} UpdateCache
 */