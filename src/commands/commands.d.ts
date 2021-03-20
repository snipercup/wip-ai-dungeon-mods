type AIDData = import("aid-bundler/src/aidData").AIDData;

type SimpleCommandHandler = (data: AIDData, args: string[]) => string | void;

type PatternCommandStruct = Record<string, SimpleCommandHandler>;
type PatternCommandMap = Map<string | RegExp, SimpleCommandHandler>;
type PatternCommandHandlers = PatternCommandStruct | PatternCommandMap;