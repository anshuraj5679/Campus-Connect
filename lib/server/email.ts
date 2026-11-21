import "server-only";

/**
 * Email is optional (spec §3.6) and stubbed behind this interface.
 * Swap ConsoleEmailSender for a Resend/SMTP implementation to send real mail.
 */
export interface EmailSender {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  async send({ to, subject }: { to: string; subject: string; text: string }) {
    if (process.env.NODE_ENV === "development" && process.env.EMAIL_LOG === "true") {
      console.info(`[email stub] to=${to} subject="${subject}"`);
    }
  }
}

export const emailSender: EmailSender = new ConsoleEmailSender();
