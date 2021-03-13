const reWhitespaceArgs = /\s+/;

/**
 * Parses basic, white-space separated arguments.
 * 
 * @param {string} arg
 * @returns {string[]}
 */
module.exports.parseArgs = (arg) => {
  if (!arg) return [];
  return arg.split(reWhitespaceArgs).map((v) => v.trim());
};