const { shutUpTS } = require("../utils");

const $$namespace = Symbol("ConfigNamespace.namespace");
const $$defaults = Symbol("ConfigNamespace.defaults");
const $$configObj = Symbol("ConfigNamespace.configObj");

/**
 * Something to handle some simple type-conversion.  Really only useful for
 * `"integer"` to handle the conversion from `number`, but it's here for
 * expansion later on.
 * 
 * @param {ConfigCommander.ConfigType} type 
 * @param {any} value 
 * @returns {any}
 */
const toType = (type, value) => {
  if (type === "number") return Number(value);
  if (type === "integer") return Number(value) | 0;
  if (type === "string") return String(value);
  if (type === "boolean") return Boolean(value);
  return value;
};

/**
 * A class to help manipulate the configuration of a namespace.
 * 
 * @template {ConfigCommander.ConfigData} TConfigObj
 */
class ConfigNamespace {

  /**
   * @param {string} namespace
   * The namespace for this configuration.
   * @param {TConfigObj} defaults
   * The defaults for the configuration object.
   * @param {Partial<TConfigObj>} configObj
   * The stored configuration.
   */
  constructor(namespace, defaults, configObj) {
    this[$$namespace] = namespace;
    this[$$defaults] = defaults;
    this[$$configObj] = configObj;
  }

  /**
   * Fetch a configuration from the store.
   * 
   * Use this when actually interacting with the configuration.
   * 
   * @template {ConfigCommander.ConfigData} TConfigObj
   * @param {AIDData} aidData
   * The current `AIDData` instance.
   * @param {string} namespace
   * The namespace to access.
   * @param {TConfigObj} defaults
   * An object describing the default configuration.  All keys you wish
   * to use must be specified.
   * @returns {ConfigNamespace<TConfigObj>}
   */
  static fetch(aidData, namespace, defaults) {
    return new ConfigNamespace(
      namespace, defaults,
      shutUpTS(ConfigNamespace.getOrCreateStore(aidData, namespace))
    );
  }

  /**
   * Gets the current storage object for a namespace.  If nothing has been
   * stored yet, it will default to an empty store.
   * 
   * @param {AIDData} aidData
   * The current `AIDData` instance. 
   * @param {string} namespace
   * The namespace to access.
   * @returns {ConfigCommander.ConfigData}
   */
  static getStore(aidData, namespace) {
    const { state: { $$configCommanderStore = {} } } = aidData;
    const namespaceStore = $$configCommanderStore[namespace] ?? {};

    return namespaceStore;
  }

  /**
   * Sets the current storage object for a namespace.
   * 
   * @param {AIDData} aidData
   * The current `AIDData` instance. 
   * @param {string} namespace
   * The namespace to access.
   * @param {ConfigCommander.ConfigData} store
   * The store to set.
   * @returns {ConfigCommander.ConfigData}
   */
  static setStore(aidData, namespace, store) {
    const { state: { $$configCommanderStore = {} } } = aidData;
    aidData.state.$$configCommanderStore = $$configCommanderStore;

    $$configCommanderStore[namespace] = store;
    return store;
  }

  /**
   * Gets or creates the storage object for a namespace.
   * 
   * @param {AIDData} aidData
   * The current `AIDData` instance. 
   * @param {string} namespace
   * The namespace to access.
   * @returns {ConfigCommander.ConfigData}
   */
  static getOrCreateStore(aidData, namespace) {
    return ConfigNamespace.setStore(
      aidData, namespace,
      ConfigNamespace.getStore(aidData, namespace)
    );
  }

  /** The namespace of this configuration. */
  get namespace() {
    return this[$$namespace];
  }

  /**
   * Gets a value from the config, asserting its type is correct.
   * 
   * If the type is incorrect or the value has not yet been set, the default
   * value will be used instead.
   * 
   * @template {keyof TConfigObj} TKey
   * @param {ConfigCommander.ConfigType} type
   * The type the value is asserted as being.  Will use the default value
   * if the type is incompatible.
   * @param {TKey} key
   * The key for the config value.
   * @returns {TConfigObj[TKey]}
   * @throws When `key` is not defined in the default schema.
   */
  get(type, key) {
    const realType = type === "integer" ? "number" : type;

    checkVal: {
      const { [key]: value } = this[$$configObj];
      if (value == null) break checkVal;
      if (typeof value !== realType) break checkVal;
      return toType(type, value);
    }

    // Going with the default.
    const defVal = this[$$defaults][key];
    if (defVal != null) return toType(type, defVal);

    // No default, throw error!
    throw new Error(`Default value for \`${this.namespace}.${key}\` is not defined.`);
  }

  /**
   * Sets a value to the config and returns it.
   * 
   * @template {keyof TConfigObj} TKey
   * @param {TKey} key
   * The key for the config value.
   * @param {TConfigObj[TKey]} value
   * The value to set.
   * @returns {TConfigObj[TKey]}
   * @throws When `value` is not compatible with the default schema.
   */
  set(key, value) {
    checkVal: {
      // Verify the value exists in the default schema.
      if (!(key in this[$$defaults])) break checkVal;
      // Verify they share the same type.
      const defType = typeof this[$$defaults][key];
      const setType = typeof value;
      if (defType !== setType) break checkVal;

      this[$$configObj][key] = value;
      return value;
    }

    // Incompatible `value` for `key`.
    throw new Error(`Value \`${value}\` is incompatible with default schema at \`${this.namespace}.${key}\`.`);
  }

}

exports.ConfigNamespace = ConfigNamespace;