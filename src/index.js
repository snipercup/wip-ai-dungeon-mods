const { Pipeline } = require("aid-bundler");
const { SimpleCommand } = require("./commands");
const withMemory = require("./with-memory");
const worldControl = require("./world-control");
const stateEngine = require("./state-engine");
const deepState = require("./deep-state");
const director = require("./director");
const contextMode = require("./context-mode");
const commonModes = require("./common-context-modes");
const annotatedMode = require("./annotated-context-mode");

const pipeline = new Pipeline();

pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-global",
  (data, [name]) => {
    if (name in globalThis) {
      // @ts-ignore - We checked, dammit!
      const target = globalThis[name];
      
      // Dump the structure.
      console.log(target);
      // And the names of any own-properties it may have.
      // I wanna make sure they're not just attaching new methods to existing objects.
      console.log(Object.keys(target));
      return `Global variable \`${name}\` dumped to logs.`;
    }
    return `The global variable \`${name}\` did not exist.`
  })
);

pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-global-vars",
  (data) => {
    console.log(Object.keys(globalThis));
    return "Global variable names dumped to logs.";
  })
);

pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-prop",
  (data, args) => {
    if (args.length === 0) return "No property path provided.";
    /** @type {string[]} */
    const traveledPath = [];
    /** @type {unknown} */
    let currentRef = globalThis;
    for (const key of args) {
      // @ts-ignore - We're doing checked object exploration.
      currentRef = currentRef[key];
      const typeOfRef = typeof currentRef;
      // Decorate the key based on certain object types.
      const descriptiveKey
        = typeOfRef === "function" ? `${key}(?)`
        : Array.isArray(currentRef) ? `${key}[?]`
        : key;
      traveledPath.push(descriptiveKey);

      if (typeOfRef === "undefined") return `${traveledPath.join(".")} is \`undefined\``;
      if (typeOfRef === "string") return `${traveledPath.join(".")} is a string:\n${String(currentRef)}`;
      if (typeOfRef !== "object") return `${traveledPath.join(".")} is \`${String(currentRef)}\``;
      if (currentRef === null) return `${traveledPath.join(".")} is \`null\``;
    }

    if (typeof currentRef === "function") {
      if (!currentRef.name) return `${traveledPath.join(".")} is a function`;
      return `${traveledPath.join(".")} is a function named \`${currentRef.name}\``
    }

    console.log(currentRef);
    return `${traveledPath.join(".")} was logged to console.`;
  })
);

pipeline.commandHandler.addCommand(new SimpleCommand(
  "dump-history",
  (data) => {
    const texts = data.history.map((entry) => entry.text);
    return JSON.stringify(texts, undefined, 2);
  })
);

withMemory.addPlugin(pipeline);

worldControl.addPlugin(pipeline);

stateEngine.addPlugin(
  pipeline,
  deepState.stateModule,
  director.stateModule
);

contextMode.addPlugin(
  pipeline,
  annotatedMode.contextModeModule,
  commonModes.forwardModule,
  commonModes.narratorModule
);

pipeline.build();