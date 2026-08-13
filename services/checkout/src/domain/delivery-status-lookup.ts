export type DeliveryStatusLookup = {
  wasDelivered(messageId: string): Promise<boolean>;
};
