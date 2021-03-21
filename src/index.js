const { Pipeline } = require("aid-bundler");
const { SimpleCommand } = require("./commands");
const withMemory = require("./with-memory");
const worldControl = require("./world-control");
const stateEngine = require("./state-engine");
const deepState = require("./deep-state");
const contextMode = require("./context-mode");
const annotatedMode = require("./annotated-context-mode");

const pipeline = new Pipeline();

pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-global",
  (data, [name]) => {
    if (name in globalThis) {
      // @ts-ignore - We checked, dammit!
      console.log(globalThis[name]);
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

withMemory.addPlugin(pipeline);

worldControl.addPlugin(pipeline);

stateEngine.addPlugin(pipeline, deepState.stateModule);

contextMode.addPlugin(pipeline, annotatedMode.contextModeModule);

pipeline.build();