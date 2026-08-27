export type DeliveryStore = {
  /**
   * Exclusively reserve messageId for sending.
   * true = caller must send. false = already sent or another attempt holds pending.
   */
  claim(messageId: string): Promise<boolean>;
  /** Record a successful send. */
  markSent(messageId: string): Promise<void>;
  /** Drop a pending claim after send failure so Pub/Sub redelivery can retry. */
  release(messageId: string): Promise<void>;
};
