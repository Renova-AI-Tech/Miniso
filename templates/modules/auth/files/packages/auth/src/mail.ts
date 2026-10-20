import nodemailer from 'nodemailer';

export interface AuthMail {
  to: string;
  subject: string;
  text: string;
}

export interface MailSettings {
  NODE_ENV: 'development' | 'test' | 'production';
  AUTH_EMAIL_FROM: string;
  SMTP_HOST?: string | undefined;
  SMTP_PORT?: number | undefined;
  RESEND_API_KEY?: string | undefined;
}

export function createMailTransport(settings: MailSettings, request = globalThis.fetch) {
  if (settings.NODE_ENV !== 'production') {
    if (settings.SMTP_HOST !== '127.0.0.1' || !settings.SMTP_PORT)
      throw new Error('Invalid local email configuration.');
    const smtp = nodemailer.createTransport({
      host: settings.SMTP_HOST,
      port: settings.SMTP_PORT,
      secure: false,
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 5000,
      ignoreTLS: true,
    });
    return {
      send: async (message: AuthMail) => {
        await smtp.sendMail({ from: settings.AUTH_EMAIL_FROM, ...message });
      },
      close: () => smtp.close(),
    };
  }
  if (!settings.RESEND_API_KEY) throw new Error('Invalid production email configuration.');
  return {
    send: async (message: AuthMail) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      timer.unref();
      try {
        const response = await request('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${settings.RESEND_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ from: settings.AUTH_EMAIL_FROM, ...message }),
        });
        if (!response.ok) throw new Error('Delivery rejected.');
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== 'object' ||
          !('id' in result) ||
          typeof result.id !== 'string' ||
          !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(result.id)
        )
          throw new Error('Invalid delivery receipt.');
      } catch {
        // Provider payloads may contain the recipient, message or credentials.
        throw new Error('Email delivery was not confirmed.');
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => {},
  };
}
