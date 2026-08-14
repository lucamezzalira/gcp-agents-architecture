export type TapeEntry = {
  entryId: string;
  topicHint: string;
  recordedAt: string;
};

export type Tape = {
  record(entry: TapeEntry): Promise<void>;
};
