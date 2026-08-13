export type DeliveryStore = {
  hasBeenDelivered(messageId: string): Promise<boolean>;
  record(messageId: string): Promise<void>;
};
