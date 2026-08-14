export type BodyStore = {
  get(bodyRef: string): Promise<string | undefined>;
};
