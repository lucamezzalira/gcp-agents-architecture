export type DeliveryStore = {
  claim(messageId: string): Promise<boolean>;
};
