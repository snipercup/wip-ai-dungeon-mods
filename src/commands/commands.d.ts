type AIDData = import("aid-bundler/src/aidData").AIDData;

type SimpleCommandHandler = (data: AIDData, args: string[]) => string | void;

type PatternCommandStruct = Record<string, SimpleCommandHandler>;
type PatternCommandEntry = [pattern: string | RegExp | null, handler: SimpleCommandHandler];
type PatternCommandMap = Map<string | RegExp | null, SimpleCommandHandler>;
type PatternCommandHandlers = PatternCommandStruct | PatternCommandMap;