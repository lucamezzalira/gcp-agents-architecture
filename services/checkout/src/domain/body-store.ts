export type BodyStore = {
  put(bodyRef: string, html: string): Promise<void>;
};
