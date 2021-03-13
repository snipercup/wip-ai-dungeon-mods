type AIDData = import("aid-bundler/src/aidData").AIDData;

type CommandFn = (data: AIDData, arg: string) => string | void;
type CommandMap = Record<string, CommandFn>;