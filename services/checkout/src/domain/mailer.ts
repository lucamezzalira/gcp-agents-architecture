export type MailerMessage = {
  to: string;
  subject: string;
  html: string;
};

export type Mailer = {
  send(message: MailerMessage): Promise<void>;
};
