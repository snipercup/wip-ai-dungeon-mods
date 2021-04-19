/// <reference path="../state-engine.d.ts" />

exports.stateModule = {
  pre: [require("./init")],
  exec: [
    // Setting up the state entries.
    require("./createStateEntries"),
    require("./validateStateEntries"),
    require("./modifyStateEntries"),
    require("./finalizeForProcessing"),
    // Crunching the data.
    require("./associateState"),
    require("./applyPreRules"),
    require("./superHappyRouletteTime"),
    // Ensure the caches are updated before `post`.
    require("./updateCaches")
  ],
  post: [require("./loadUpMemory")]
};