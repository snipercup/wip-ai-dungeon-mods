# TODO

## Total Recall
A dynamic State Engine entry that back-references something in the history.  This
is a feature of the vanilla context.  Might be cool to see what could be done with
the concept.

Would require enhancing State Engine with the ability to dynamically produce its
text, rather than using the World Info exclusively.

## Forced Actions
A system of automatically setting the `frontMemory` based on a system of cooldowns
and keyword matching.  They essentially forcibly inject text in front of the
player's text to covertly influence the AI.

## Context Builder (a tool for Context Mode)
Once the requirements for constructing a context are fully explored, create an API
that will simplify context construction from various data-sources:

```js
(builder) => {
  const reStorySoFar = /^The story so far:\s+((?:.|\s)*?)$/i;

  builder
    .section("context", (builder) => {
      const note = builder
        .source("StateEngine.forContextMemory")
        .discardable()
        .prioritizeBy("priority", "desc")
        .prioritizeBy("score", "desc");
        
      const summary = builder
        .source("WithMemory.summary")
        .map((text) => {
          const [, fixedSummary] = reStorySoFar.exec(text) ?? [];
          return fixedSummary;
        });

      return builder.printMemLn(note).printMemLn(summary).printMemLn("--------");
    })
    .section("story", (builder) => {
      const note = builder
        .source("StateEngine.forHistory")
        .map((text) => `[Note: ${text}]`);
      const authorsNote = builder.source("authorsNote")
        .map((text) => `[Style: ${{text}}]`);
      const frontMem = builder.source("frontMemory");
      const history = builder.source("history")
        .before(-3).printMemLn(authorsNote)
        .after(-1).printMemLn(frontMem);

      const historyPair = builder
        .join(note, "source", history, "offset")
        .printMemLn(note)
        .printOutLn(history);
      return builder.printOutLn(historyPair).printOutLn(frontMem);
    })
};
```