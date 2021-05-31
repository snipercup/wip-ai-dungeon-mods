# AI Dungeon Mods
A WIP mega-repo of various mods I've been putting together.  I'm shelving this project for now due to AI Dungeon turning into a cesspool of bugs and garbage.

This iteration is based on [AID-Bundler](https://github.com/AID-Bundler/aid-bundler) and its plugins system, since I was tired of working in huge, long files with no modules.  That makes it a little less accessible, but...  I had a better time writing it all.

## Installation
Check the [Releases page](https://github.com/TaleirOfDeynai/wip-ai-dungeon-mods/releases) for a ready-to-use ZIP file.  Just upload the ZIP file into a scenario with the upload button and spend the next hour or two updating world-info with AID's new, buggy-as-duck World Info Library System.

After you start your adventure, I recommend running the following commands:
* `/context-mode set narrator` will assemble the context sent to the AI so it kind of looks like an audio-book script...  Kinda?  You may want to pass it up if you prefer second-person over third-person, but it's the best of the available context modes, in my opinion.
* `/report-summary-updates on`, if you enable the Adventure Summary feature in the Edit Adventure menu.  This will display a message whenever the summary updates, so you can see how badly the AI got it.

## Installation 2: Install Harder
If you want to tweak the scripts, customize the build, or what not, you'll need to do a few additional things.

1. Install [NodeJS](https://nodejs.org/en/) for your OS.
2. Pull or download this repo so you have your own copy.
2. Using your command-line software of choice, navigate to the directory you placed it.
3. Execute: `npm install`
4. Execute: `npm run bundle`

Now you have produced your own build.  If you didn't, then...  *shrugs*  Figure it out.

## Rushed Guide (with examples)

### Oddities
The code calls the identifiers in State-Engine entries `keys`, but I'll be referring to them as "tags" here, so they're less likely to be confused with "keyword".

I intended to refactor this in code, but whatever.

### Vanilla World-Info Support
This script should work with vanilla entries out-of-the-box.  They can also use the new matcher features for both keywords and relations.

Example:
> **`guard, captain, "boris", :Lelindar`**
> Captain Boris is a male human who commands Lelindar's city guard.

### Anatomy of a State-Engine Entry
A typed State-Engine entry is required to introduce tags for the relation matchers.

`$Player[Taleir & Fox & Female](adventurer; rogue)`

There are three parts to a typed entry, the "type", the "tags" and the "matchers".

In this example:
* The `$Player` portion identifies the type of entry, a "Player" entry.  These are case-sensitive.
* The `[Taleir & Fox & Female]` portion are the tags, separated by `&`.
  * They cannot currently contain spaces and are case-sensitive.
  * It is generally a good idea to capitalize the first letter to make it more obvious its a tag.
  * Tags can be thought of bringing a named concept into context.
    * In the example, if this entry were associated with any text, the concepts of the character Taleir, the vulpine race, and the female sex would be brought into context.
    * If another entry wants to provide more information about something in context, it would use a relation to match the tag(s) identifying those concepts, IE: `(:Fox; :Female)` would attempt to match female foxes.
* The `(adventurer; rogue)` portion are the matchers, two keywords in this case.
  * Keywords are not case-sensitive but tags used by relations are.
  * It is a good practice to keep keywords in all-lowercase to differentiate them from tags in relations.

Matchers are separated by a semi-colon (`;`), **NOT** a comma (`,`).  This is intended to save time when AI Dungeon's vanilla world-info matcher tries to match world-info to text, since State-Engine will be redoing all its work, anyways.

All but the type section can be optional, depending on the rules of that type of entry.

### Association Sources
State-Engine has a number of association sources that it supports.  These setup rules about what text an entry can match and how it might be used when selected through that association.

Some entries may associate with multiple sources or just peek at them for information, but not actually create an association.

Only these are currently in use:
* Implicit association (referred to as `"implicit"` in the code) allows only one entry of each type.  For example, if multiple `$Location` entries are provided which can only associate implicitly, only **one** of those entries will be included in the context.
* Action association (referred to as `"history"` or just a `number` in the code) allows any entry to associate if it matches the action's text.  Multiple entries can create an association, but a roulette based on how well they matched the text is run to select only **one** entry per action.
  * Actions are processed from oldest to latest actions.  This means that tags brought into context in a later action will not be available to entries that are looking for that tag from an earlier action.
* Author's Note association (referred to as `"authorsNote"` in the code) will inject the entry's text as the Author's Note when it is selected.
  * This is used by the `$Direction` entry to do its work.

Currently un-used association types, for those curious:
* Implicit Reference association (referred to as `"implicitRef"` in the code) allows an entry to match the text of an entry associated through an Implicit association.  This is intended to get a bit meta, allowing an entry to look for text in another entry and provide more context about it.
  * This largely became irrelevant due to relations.
  * I was actually thinking of replacing it with another association type that would allow an entry to match on other entries associated through _any_ means, not just implicitly.
* Player Memory association (referred to as `"playerMemory"` in the code) allows an entry to match on text in the player's pinned memory.
* Front Memory association (referred to as `"frontMemory"` in the code) will inject the entry's text as the Front Memory when it is selected.
  * This was intended to implement the Forced Actions module listed in the `TODO.md` file, but I never got around to it.

### Matchers

#### Keywords
* `<term>` - Your basic keyword.  Terms now match the start of the word only, so your keyword "king" will stop matching "parking".
* `+<term>` - Inclusive keywords.  Does nothing; only here as the inverse of exclusive keywords.
* `-<term>` - Exclusive keywords.  If the term matches a word in the text, it will prevent the entry from associating to the action.
* `"<term>"` - Exact-match keywords.  Must match the term exactly.
* `-"<term>"` - Exclusive exact-match keywords.  Yes, you can combine them!

#### Relations
* `:<tag>` - The All-Of relation.  All tags with `:` must be in context.
* `?<tag>` - The Any-Of relation.  At least one tag with `?` must be in context.
  * Only useful if multiple tags share this relation type, IE: `(?Taleir; ?Riff)` wants at least one of these two tags.
  * If it manages to get both tags into context, its score will be increased.
* `@<tag>` - The Immediate relation.  The tag must be associated with the current action.  It is not allowed to search previous actions for the tag.
* `!<tag>` - The Negated relation.  The tag cannot be in context.

### The `$Player` Entry
Use this to provide information about the player's character.  It has a very high selection bias, so it is likely to be provided to the AI on almost every action.

It has the following rules:
* It requires at least one tag.
* It supports keyword matchers.
* It does not support relation matchers.
* The first tag in the list will also be used as a keyword automatically, so you can get away with only `$Player[Taleir]` and it will automatically infer an exact-match keyword of `"taleir"`.
* Supports multi-player.  Multi-player mode is enabled if there is more than one named player.
  * Multi-player mode causes `$Player` entries to need to be associated with action text in order to be included.
  * In single-player mode, the entry is always associated implicitly.

Example:
> **`$Player[Taleir & Female & Fox]`**
> Taleir is a female fox and a rogue.  She has just returned to her home town of Lelindar after several months on a job.

### The `$NPC` Entry
Use this to provide information about non-player characters.

It has the following rules:
* It requires at least one tag.
* It supports keyword matchers.
* It does not support relation matchers.
* The first tag in the list will also be used as a keyword automatically, so you can get away with only `$NPC[Riff & Otter]` and it will automatically infer an exact-match keyword of `"riff"`.
* Each entry has a 1-in-20 chance of being included implicitly to remind the AI of their existence.  If multiple entries are selected in this way, only one will be included implicitly.
* However, they can still also match through action text.

Example:
> **`$NPC[Riff & Male & Otter](jeweler)`**
> Riff is a male otter in Lelindar who owns and operates a jewelry store.

### The `$Location` Entry
This entry has a very high selection bias.  It is always implicitly associated, which means only one such entry can match at a time.

Good usages include:
* Telling the AI where the player is.
* Telling the AI who is with the player.
* Providing general, but important information about the world.

It has the following rules:
* Always implicitly associated; only one `$Location` entry will be selected for the context.
* Does not support tags.
* Does not support matchers of any sort.

Examples:
_Indicating the player's location._
> **$Location**
> Taleir is currently in Lelindar's trading district.

_Indicating important world information._
> **$Location**
> Taleir lives in a world where magic exists, but is largely forgotten to the denizens on the surface.

### The `$Lore` Entry
This entry is intended to provide general, static information about the world.  It matches the text of actions and if it associates with an action, its entry may appear in the context.  It has a relatively low selection bias.

Good usages include:
* Providing additional background information or general goals for characters.
* Providing information about locations in the world.
* Providing information on your world's races, monsters, starship types, etc.

Tips and tricks:
* For locations within a city, is usually detrimental to relate the location to the city it is in.  It is a bit uncommon for the city's name to be mentioned to bring it into context so that the location within the city can satisfy its relation.  Your milage may vary.

It has the following rules:
* Associates only with action text.
* Supports zero or more tags.
* Supports zero or more matchers of any type.
  * It has a special ability regarding matchers.  See below.
* If the entry has no inclusive keywords, it compares the entry's text with the action's text to determine a score.  The more words the two have in common and the less common those words are in _all_ the text available for analysis, the higher the score will be.
* Receives a score boost if the `$Lore` entry is related to a _later_ `$State` entry.
  * This increases the chances that this entry can add more context to the related `$State` entry.

This entry has a special ability when making a lot of `$Lore` entries for the same concept.  A `$Lore` entry that has no _inclusive_ matchers (it can have exclusive/negated matchers) will attempt to locate another `$Lore` entry with all the same keys that it has that _does_ have inclusive matchers.

If it manages to find one, **and only one**, such entry, it will duplicate those matchers to itself.

This allows you to define a single entry for something and then expand upon it across several entries without having to copy-and-paste its matchers.

_Note: There is no error or validation message shown if a `$Lore` entry fails to find a compatible entry, at this time.  In this case, the entry will just never match anything._

Examples:
_Establishing a location in the world._
> **`$Lore[Lelindar]("lelindar"; city)`**
> Lelindar is a small city largely populated by humans.

_Establishing a race in the world._
> **`$Lore[Fox & BeastFolk](fox; vulpine; vixen)`**
> Foxes are a sentient digitigrade people with the features of a fox.

_Embellishing the race with matcher duplication.  It will get the keywords from the previous example._
> **`$Lore[Fox & BeastFolk]`**
> Foxes have fur of earthy tones, often with white fur on their stomach.

_You can still use relations with no tag, as well._
> **`$Lore(:Fox; :Lelindar)`**
> The population of foxes in Lelindar is rather limited, as foxes are not normally attracted to city life.

### The `$State` Entry
State entries provide immediately important information about the world and its concepts.  It is not a bad idea to manually introduce new `$State` entries as the story develops, so the AI knows what's up.  It has a very high selection bias.

Good usages include:
* Providing information about what a character is carrying with them.
* Providing the AI with stateful information, like what spells are currently influencing a character.
* Updating the AI on the progress of goals for NPCs (for players, it's usually best to use the pinned memory or `$Location` entry).
* When used carefully, you can also use this entry to pressure the story toward a specific state.
  * For instance, my test scenario started you in a city, but the scenario was intended to get you spelunking in some tunnels to battle the big-bad.  `$State` entries that detect when the city is mentioned sprinkled information about the tunnels so the AI would gravitate in that direction.

It has the following rules:
* Can have at most one tag.
* Requires at least one matcher of any type.
* Only **two** of these entries can be selected at a time, favoring entries associated closest to the most recent actions.
  * This is to help keep `$State` entries from dominating the context, as they have _very_ heavy selection weighting.
* When matching an action, it only searches the previous two actions for related tags, meaning the mention must be very close in context to be associated.

Examples:
_Informing the AI about a character's state._
> **`$State(:Taleir)`**
> Taleir has been hit by a stupify spell.  She will have a hard time understanding things said to her.

_Informing the AI about something interesting about a character, to bait a specific interaction._
> **`$State(:Riff)`**
> Riff has secretly been practicing tailoring.  He's a bit bashful about his current attempts and keeps them hidden away.

_Informing the AI about happenings at a location.  Let the race wars begin!_
> **`$State(:Lelindar; :BeastFolk)`**
> There has been upheaval in Lelindar recently with harsh new restrictions placed on where beast-folk may go and how they may address themselves to humans.

### The `$Direction` Entry
This entry dynamically sets the Author's Note used in the context.  It attempts to associated with the latest 5 entries in the action history and if successful, will be selectable as the Author's Note text.

Good usages include:
* Baiting the AI into setting up particular scenes.
* Baiting the AI to introduce or involve particular characters.
* Bringing the AI's focus to certain details or character states.
* And of course, trying to get the AI to be biased toward a writing style.

It has the following rules:
* Can have at most one tag.
* Can have zero or more matchers of any type.
  * If the entry was given a tag, it has no relation matchers, and an entry of another type shares that tag, the entry will be implicitly related to that tag.
  * If the entry has no matchers, it will still associate with a low chance of selection.
* Checks only the latest 5 actions for matches.
* If selected, the entry's text will be used as the Author's Note for the next 12 turns, giving the AI time to act upon it before it changes again.

Examples:
_The classic._
> **`$Direction`**
> Be descriptive.

_Baiting a scene._
> **`$Direction(?RatGang; ?Guard)`**
> The sounds of rowdy individuals can be heard nearby.

_Trying to bring another character into play.  The tag will bring their entries into context._
> **`$Direction[Riff](:Taleir; :Lelindar; !Riff)`**
> Introduce Riff, an otter jeweler, into this scene.

### The `$Class` Entry
This entry type does not provide its text to the context.  It's instead intended to reduce repetition in world-info by grouping collections of keywords into a single classification.

You do need to provide text for the entry, though, or else AI Dungeon will discard the entry.  Or at least, it used to before the World-Info library was introduced.  Who knows what it will do now!

It has the following rules:
* Must have exactly one tag.
* It must have at least one matcher of any type.
* Relations will only match if its related tags are associated with the _current_ action being matched.
  * It will not look at past actions for related tags, even if you are not using an Immediate relation.
* Its text will not be used in the context.
  * It is used only to generate a tag for other entries to relate to.

Examples:
_Creating a classification for a gender._
> **`$Class[Feminine](female; feminine; woman; girl)`**
> A class for generally feminine terms.

_Creating a classification for race specific gender terms._
> **`$Class[FeminineFox](vixen)`**
> A class for feminine vulpine.

_Creating an all-encompassing classification for a gender-word._
> **`$Class[Female](?Feminine; ?FeminineFox; ?FeminineRabbit)`**
> A class for any female.

_Using the class to match a female for a character quirk._
> **`$State(@Female; :Riff)`**
> Riff gets anxious and nervous in the presence of females, though he appreciates their company.

### Tips and Tricks

* Keep your world-info entries short.  Break longer entries apart into multiple entries if possible and rely on State-Engine to pick the most relevant information for the story.
* `$Lore` entries will have a hard time relating to unique tags from `$State` entries, since they tend to match so close to the latest action, where there may not be enough entries remaining to reliably associate.
* If playing in second-person mode, you may want to setup your Player entry like this: `$Player[Taleir](you)`

## Context-Mode
A context-mode applies a custom transformation to the context sent to the AI.  You have four to choose from in this package.

The story generated below is using the entries provided as examples in the guide.  I did not invest a great deal into it, so it's kind of bland, but hopefully gets the idea across!

### Vanilla
Very similar to AI Dungeon's standard context output.  However, it still applies more intelligent sorting and grouping of entries.

It is enabled by default at the start of the adventure, but can be enabled explicitly with:
`/context-mode set vanilla`

#### Example Output
```
Taleir is a female fox and a rogue. She has just returned to her home town of Lelindar after several months on a job.
Foxes have fur of earthy tones, often with white fur on their stomach.
Taleir is currently in Lelindar's trading district.
Riff has secretly been practicing tailoring. He's a bit bashful about his current attempts and keeps them hidden away.
The protagonist Taleir has just returned to her home of Lelindar, a city mostly populated by humans. Tensions are high between the humans and the beast-folk they look down upon. The beast-folk of the area have begun banding together in response to a rise in criminal activity from humans, and they're also becoming more openly hostile towards the human government, who they believe to be failing to look after their interests.
Taleir has just passed through the city's gates and entered the trade district. She is hurrying home, where her husband Riff is expecting her. The two of them are keeping the fact that they are married a secret from most people, as otters and foxes are not fond of their relationship.
[Author's Note: Be descriptive.]
Taleir's last job had kept her away from him for so long, but she can sense a tense atmosphere as she walks through the streets.  It unnerves her a bit as she approaches Riff's little shop. As she opens the door and enters, Riff himself comes out of his room, which consists of a small bed and a chest of drawers. He smiles when he sees her.
"There you are," he says. "I was wondering when you'd get back."
Taleir looks about wearily before sneaking a kiss at her husband.  "I'm sorry.  It was a bit more daunting than I realized..."
```

### Narrator
A custom context-mode that attempts to mimic a narrator's script.

You will probably get the most out ot if with third-person stories in "Story" mode.

It can be enabled with the following command:
`/context-mode set narrator`

#### Example Output
```
Narrator's Notes:
• Taleir is a female fox and a rogue.  She has just returned to her home town of Lelindar after several months on a job.
• Foxes have fur of earthy tones, often with white fur on their stomach.
• Riff is a male otter in Lelindar who owns and operates a jewelry store.
• Riff has secretly been practicing tailoring.  He's a bit bashful about his current attempts and keeps them hidden away.
• Taleir is currently in Lelindar's trading district.

The protagonist Taleir has just returned to her home of Lelindar, a city mostly populated by humans.  Tensions are high between the humans and the beast-folk they look down upon. The beast-folk of the area have begun banding together in response to a rise in criminal activity from humans, and they're also becoming more openly hostile towards the human government, who they believe to be failing to look after their interests.
Taleir has just passed through the city's gates and entered the trade district. She is hurrying home, where her husband Riff is expecting her. The two of them are keeping the fact that they are married a secret from most people, as otters and foxes are not fond of their relationship.
[Direction: Be descriptive.]
Taleir's last job had kept her away from him for so long, but she can sense a tense atmosphere as she walks through the streets.  It unnerves her a bit as she approaches Riff's little shop. As she opens the door and enters, Riff himself comes out of his room, which consists of a small bed and a chest of drawers. He smiles when he sees her.
"There you are," he says. "I was wondering when you'd get back."
Taleir looks about wearily before sneaking a kiss at her husband.  "I'm sorry.  It was a bit more daunting than I realized..."
```

### Forward
A custom context-mode that attempts to mimic the forward section of your typical fan-fiction.  It is similar to Narrator, but varies slightly in terms it uses and how it breaks thing apart.

You will probably get the most out ot if with third-person stories in "Story" mode.

It can be enabled with the following command:
`/context-mode set forward`

#### Example Output
```
Reader's Notes:
• Taleir is a female fox and a rogue.  She has just returned to her home town of Lelindar after several months on a job.
• Foxes have fur of earthy tones, often with white fur on their stomach.
• Riff gets anxious and nervous in the presence of females, though he appreciates their company.
• Taleir is currently in Lelindar's trading district.
• Riff has secretly been practicing tailoring.  He's a bit bashful about his current attempts and keeps them hidden away.
--------
The protagonist Taleir has just returned to her home of Lelindar, a city mostly populated by humans.  Tensions are high between the humans and the beast-folk they look down upon. The beast-folk of the area have begun banding together in response to a rise in criminal activity from humans, and they're also becoming more openly hostile towards the human government, who they believe to be failing to look after their interests.
Taleir has just passed through the city's gates and entered the trade district. She is hurrying home, where her husband Riff is expecting her. The two of them are keeping the fact that they are married a secret from most people, as otters and foxes are not fond of their relationship.
[Author's Note: Be descriptive.]
Taleir's last job had kept her away from him for so long, but she can sense a tense atmosphere as she walks through the streets.  It unnerves her a bit as she approaches Riff's little shop. As she opens the door and enters, Riff himself comes out of his room, which consists of a small bed and a chest of drawers. He smiles when he sees her.
"There you are," he says. "I was wondering when you'd get back."
Taleir looks about wearily before sneaking a kiss at her husband.  "I'm sorry.  It was a bit more daunting than I realized..."
```

### Annotated
A custom context-mode that simply annotates each type of thing emitted in the context.

It is the oldest of my custom contexts and mostly just kept around as an additional test of the system.  Feel free to give it a try, though.

It can be enabled with the following command:
`/context-mode set annotated`

#### Example Output
```
Style:
Be descriptive.
Notes:
• Taleir is a female fox and a rogue.  She has just returned to her home town of Lelindar after several months on a job.
• Foxes have fur of earthy tones, often with white fur on their stomach.
• Foxes are a sentient digitigrade people with the features of a fox.
• Riff is a male otter in Lelindar who owns and operates a jewelry store.
• Riff has secretly been practicing tailoring.  He's a bit bashful about his current attempts and keeps them hidden away.
• Taleir is currently in Lelindar's trading district.
Story:
The protagonist Taleir has just returned to her home of Lelindar, a city mostly populated by humans.  Tensions are high between the humans and the beast-folk they look down upon. The beast-folk of the area have begun banding together in response to a rise in > criminal activity from humans, and they're also becoming more openly hostile towards the human government, who they believe to be failing to look after their interests.
Taleir has just passed through the city's gates and entered the trade district. She is hurrying home, where her husband Riff is expecting her. The two of them are keeping the fact that they are married a secret from most people, as otters and foxes are not fond of their relationship.
Taleir's last job had kept her away from him for so long, but she can sense a tense atmosphere as she walks through the streets.  It unnerves her a bit as she approaches Riff's little shop. As she opens the door and enters, Riff himself comes out of his room, which consists of a small bed and a chest of drawers. He smiles when he sees her.
"There you are," he says. "I was wondering when you'd get back."
Taleir looks about wearily before sneaking a kiss at her husband.  "I'm sorry.  It was a bit more daunting than I realized..."
```

## Script Modules
Here are brief descriptions of all the modules available in the repo.

### State-Engine
Replaces the World-Info system with one that has intelligence behind it.  It was created to build a dynamic player memory so you don't have to put as much into your pin-memory, trying to be straight-forward enough to add entries to your adventure on the fly.

* Works with vanilla entries; just throw it in to get some benefits.
* Improves keywords with leading-match, exact-match (`"<term>"`), and negation (`-<term>`).
* Relate your WI to other WI so they can add additional context for the AI.
* Extend it with "State Modules" providing new entry types.
* Sorts selected WI in a manner that is somewhat coherent.

Provides only two entry types:
* `$Class` - To create classifications of things so you don't have to copy and paste so many god damn keywords.
* A fall-back entry to support vanilla world-info.  It does nothing special, but still supports the keyword improvements and relations.

Commands:
* `/state-engine report` attempts to display information about what world-info was in context after the last player-initiated action.
  * Regarding the input/output phases:
    * A report from an input phase was sent to the AI as a result of your input.
    * A report from an output phase was sent to the AI as a result of commanding the AI to continue without input.
  * Regarding what the command will display when:
    * If your last action was to submit new text, it will be from the input phase.
    * If you continued, it will be from the output phase.
    * If you did an undo, it gets complicated!  It will probably from the turn before the undo unless the latest entry is one of your inputs, in which case it will be the latest turn.
    * For this reason, try to only trigger the command immediately after the AI has generated something.
  * World-info listed may not have been presented to the AI; the system will try to fit in as many entries as it can, but the space is very limited and some entries may have been dropped.
  * Use the Script Diagnostics function (the brain icon) in the Scenario Scripts page of the Scenario Editor to view what was actually sent to the AI.
  * This is a debug command, but it can help you tune your world-info entries a bit.
* `/state-engine report latest` is similar to `report`, but it will always be for the latest recorded action.
  * The report generated will usually be from the output phase.
  * Unless you have done an undo, in which case it's something from the past.
  * Data for the output phase is generated in case you want to use the continue function, but it may not have been sent to the AI yet.
* `/state-engine reset` wipes all the internal caches it maintains in the `state` object.

### Deep-State
This is the bulk of what makes State-Engine work.  The entry types it provides have specialized uses that try to build the best context memory for the latest state of the story.

Adds the following State-Engine entry types:
* `$Player` - To describe player characters.
* `$NPC` - To describe other characters in your adventure.
* `$Location` - To describe the player's current location or provide context to the world.
* `$Lore` - To describe your world in a general manner.
* `$State` - To describe important and changing state for any of these previous entries.

### Director
Adds a single State-Engine entry type, `$Direction`, that dynamically injects its text into the Author's Note when it matches text in the action history.

### Total Recall
Adds a single State-Engine entry type.  This entry type is dynamically generated and not generated from a world-info entry.  It re-implements the Memory Look-back feature of vanilla AI Dungeon, but uses the powers of the Stemming module to perform the lookup with a TF-IDF search.

It basically works by searching the history from 50 to 150 actions into the past, and if the match is strong enough, it will associate implicitly.  The score of the match is influenced by how strongly it matches the latest action's text.

It is actually fairly unlikely to trigger, as the recalled action must exceed a threshold based on how unique the latest action is in order to associate and then actually be selected for inclusion into the context.

### Context-Mode
A system for providing different ways to assemble the context sent to the AI.  It does nothing on its own.

Commands:
* `/context-mode list` lists all installed context-mode modules.
* `/context-mode set <module-name>` enables a context mode.
* `/context-mode current` displays the currently enabled context mode.

### Common Context-Modes
A Context-Mode module that provides a couple of similarly structured contexts.  They largely differ in what words they use when presenting certain kinds of material.

These modes work best in third-person mode.

Provides the following context-modes:
* `forward` - Designed to mimic the forward section of fan-fiction.  Uses terms like "Reader's Notes" and "Author's Note".  The AI may, or may not, produce more fan-fiction-like output when this is enabled.
* `narrator` - Designed to mimic an audio-book script or something.  I dunno!  It was an experiment that kind of bore fruit!  Uses terms like "Narrator's Notes" and "Direction".  This is currently my favorite.

### Annotated Context-Mode
A Context-Mode module named `annotated` that presents information to the AI with a preceding tag describing what that information is supposed to be.  It was one of my first attempts at a custom context and is...  Well, it was good until Latitude lobotomized the AI.

It probably works well in both second-person and third-person modes.

### With-Memory
Provides some player-memory enhancements.

* It can extract the AI-generated adventure summary from the player memory.  The summary will be available at `AIDData.summary`.  It will still include the "The story so far:" bit.
* It will also clean out the comment that separates the player's memory from the summary.
* It can also store summaries for rewind, however there is no API to _change_ the summary for the player, so this is just to help it generate things using the old summary when the player rewinds.  The player will still need to manually remove portions of the summary that may no longer be relevant at the new point in the story.

Commands:
* `/set-authors-note <text>` sets an author's note.  The Author's Note field in the Pin menu doesn't work and this text is not available to scripts, meaning this is a way you can set it by hand.
  * Note: the `$Direction` State-Engine entries will stop working if you set an author's note, as State-Engine is designed to not interfere with other scripts that may be doing their own thing.
  * You can clear the author's note by running this command without providing text.  This sets it to an empty string.
* `/report-summary-updates` tells you if it will report summary updates.
* `/report-summary-updates on` enables a message that will show when the adventure summary changes.  This includes both the player changing it and the AI changing it, as it has no idea who was responsible.
* `/report-summary-updates off` disables the update message.
* `/report-summary` displays the current summary as a message.
* `/reset-with-memory` clears With-Memory's managed caches.

I never upgraded this module with the `PatternCommand` to namespace the commands.  Sorry!

### World-Control
Provides command for working with world-info.  Primarily, I used it to show and hide entries for debugging.

_Due to Latitude incompetence, commands that show and hide entries are likely broken until they finally fix the World-Info scripting API._

Commands:
* `/world-control show` reveals world-info that were hidden by the scenario when the adventure first began.
* `/world-control hide` does the inverse of `show`, re-hiding any entries that were revealed.  It will leave entries that did not exist when the scenario started alone, however.
* `/world-control show index <n>` forcefully shows the World-Info at `worldEntries[n]`.
* `/world-control hide index <n>` is the opposite of `show index <n>`.
* `/world-control report <n>` dumps the world-info at `worldEntries[n]` to console.
* `/world-control rebuild` rebuilds its internal cache of hidden scenarios based on the current state of all entries in the `worldEntries` array.  So, if you `show` and then `rebuild` you can't `hide` anymore.
* `/world-control reset` just wipes its internal cache.  This will force it to `rebuild` when the input modifier next executes.

### Turn-Cache
A utility module that provides per-action caching capabilities.

### Stemming
A utility that provides a Lancaster word stemmer and TF-IDF capability for comparing and querying all the text currently in context.

Deep-State uses this to give a better score to `$Lore` entries when they have no inclusive keywords but are matched through a relation.  It was also intended to be used to implement the Total-Recall module in `TODO.md`.

### Commands
Provides two AID-Bundler `Command` types:
* `SimpleCommand` just allows you to return a `string`, which will be set to `state.message`.  You can also return `undefined` to not set a message.
* `PatternCommand` allows you to list out a bunch of commands based on an exact-match `string` or a `RegExp` that, if matched, will trigger the provided command handler.  The command handlers function like `SimpleCommand`, allowing you to return a message.  Supports `Object` dictionaries, but best with a `Map`.

### Utils
Before AID-Bundler and the ability to just use NPM modules, I wrote a bunch of common utilities that are used by many of these modules.

Most notably, it includes many functions for performing operations on `Iterable` objects, including `chain` which sets up a pipeline to manipulate them.  This has been very handy for doing the text processing needed for all this, as Lodash is inconsistent with its own handling of `Iterable`.

It's probably not super efficient, but who cares.  It gets the job done.

This is used by almost every other module.

## License
_Released under the terms of The Unlicense; do with this as you please._

See the `LICENSE` file for more details.