/**
 * Due to retarded limits in TypeScript, you can't use obvious type-guards
 * to differentiate `AssociationParams` from each other.  Apparently, `"implicit"`
 * and `1` are impossible to disambiguate using `typeof params.source === "number"`.
 * 
 * Ryan Cavanaugh should be fired.
 * 
 * @template {AssociationTargets} TType
 * @param {TType} type
 * @param {AssociationParams} params 
 * @returns {params is AssociationParamTypes[TType]}
 */
exports.isParamsFor = (type, params) => {
  if (typeof params.source === "number") return type === "history";
  return type === params.source;
};

/**
 * Tells you if an `AssociationParams` has searchable text.
 * 
 * @param {AssociationParams} params 
 * @returns {params is AssociationParamTypes["implicitRef" | "playerMemory" | "history"]}
 */
exports.isParamsTextable = (params) =>
  "entry" in params;

/**
 * Creates a ten word excerpt from a string.
 * 
 * @param {string} str
 * @returns {string}
 */
exports.makeExcerpt = (str) => {
  const splitUp = str.split(" ").filter(Boolean);
  const shortened = splitUp.slice(0, 10);
  if (splitUp.length === shortened.length) return str;
  return `${shortened.join(" ").replace(/\.$/, "")}...`;
};

/**
 * Converts a world info entry into a standardized string.
 * 
 * You can optionally include an excerpt, which will be on a new line with
 * a prefixed tab.
 * 
 * @param {WorldInfoEntry} worldInfo
 * @param {boolean} [withExcerpt]
 * @returns {string}
 */
exports.worldInfoString = (worldInfo, withExcerpt = false) => {
  const result = `WorldInfo#${worldInfo.id}<${worldInfo.keys}>`;
  if (!withExcerpt) return result;

  return `${result}\n\t${exports.makeExcerpt(worldInfo.entry)}`;
}

/**
 * Converts a `StateEngineData` or `StateEngineEntry` into a standardized string.
 * 
 * @param {Object} parts
 * @param {string} parts.type
 * @param {string} parts.entryId
 * @param {Iterable<string>} parts.relations
 * @param {string | null} [parts.key]
 * @param {string} [parts.entryText]
 * @returns {string}
 */
exports.stateDataString = (parts) => {
  const { type, key, relations, entryId, entryText } = parts;
  const relPart = [...relations].filter((str) => str !== key).join(" & ");
  const keyPart = [key, relPart].filter(Boolean).join(": ");
  const typePart = keyPart ? `$${type}[${keyPart}]` : `$${type}`;
  const result = `StateEntry#${entryId}<${typePart}>`;
  if (!entryText) return result;

  return `${result}\n\t${exports.makeExcerpt(entryText)}`;
};