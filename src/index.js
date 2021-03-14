const { Pipeline } = require("aid-bundler");
const { SimpleCommand } = require("./commands");
const withMemory = require("./with-memory");
const stateEngine = require("./state-engine");
const deepState = require("./deep-state");
const contextMode = require("./context-mode");
const annotatedMode = require("./annotated-context-mode");

const pipeline = new Pipeline();

pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-game-info",
  (data) => {
    console.log(data.info);
    return "Game info dumped to logs.";
  })
);

pipeline.commandHandler.addCommand(new SimpleCommand(
  "clear-authors-note",
  (data) => {
    delete data.state.memory.authorsNote;
    return "Cleared the Author's Note set to state memory."
  })
);

withMemory.addPlugin(pipeline);

stateEngine.addPlugin(pipeline, deepState.stateModule);

contextMode.addPlugin(pipeline, annotatedMode.contextModeModule);

pipeline.build();