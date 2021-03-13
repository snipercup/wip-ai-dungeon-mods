# TODO

## Caching System
Extract the turn cache into a separate module for re-use.  I want to use it for the
With Memory plugin too.

- Needs some flexibility from *when* it will pull data from the cache.
  - Exact turn/current turn.
  - Cache closest to nearest turn (before current turn).
  - Latest item in the cache.

Use with Lodash `get` and `set`?

## With Memory
Currently, State Engine adds the player memory to the `AIDData` object itself.  Pull
this out and add to it summary extraction and caching.  Allow the player memory to
be mutable (though it will neccessarily reset each turn).  It's just to aid processing
later on.

## Summarine
Creates a World Info entry that tracks the relevant Adventure Summary.  Places it
into a `$Summary` State Engine entry so it can be used with Context-Mode more easily.

Should be an `implicit` entry, so it can be matched with `implicitRef` associators.
Should have a minimum priority, so it gets shuffled closer to the story text, in general.

## State Engine State Object
Right now, we have a bunch of `let` variables that store the processing state as it
flows through the various functions.  If we pull those out, we can place more of
these tiny functions into their own modules, which will make maintenance a little
easier, as we don't have to scroll around as much.

## Dynamic Author

## Forced Actions