# TODO

## Kinds and Relations Refactor
Alter the syntax so that `$Type[B: A]` implies a kind, "B is a kind of A".  All
this really does is so that if something relates to an `A`, then a `B` can match.
Or, an entry now has a `keys` property rather than a single `key`.

Relations will be moved into the match section, in parenthesis, `$Type(:A, keyword)`.
There are a few prefixes that can be used:

`:` - An "all of" relation.  All relations prefixed with a `:` must match.
`?` - An "at least one" relation.  The relation is optional, but if no other
      relation of type `:` or `?` matches, then no match happens.
`!` - A "not ever" relation.  Similar to negated keywords, if this relation
      finds a match, the entry cannot match.

Additionally, add in exact-match keywords.  These are just in double-quotes, such
as `"chu"`, and can be altered with modifiers, like `-"chu"`.

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