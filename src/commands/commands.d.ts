type AIDData = import("aid-bundler/src/aidData").AIDData;

type SimpleCommandHandler = (data: AIDData, args: string[]) => string | void;