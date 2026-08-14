export type HtmlStore = {
  put(key: string, html: string): Promise<void>;
};
