import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailTransport } from '../../packages/auth/src/mail.js';

const settings = {
  NODE_ENV: 'production' as const,
  AUTH_EMAIL_FROM: 'access@example.com',
  RESEND_API_KEY: 're_SENTINEL_PRIVATE_KEY',
};
const message = {
  to: 'recipient@example.com',
  subject: 'Ativar seu acesso',
  text: 'https://example.com/ativar?token=SENTINEL_PRIVATE_TOKEN',
};
const receipt = { id: '0cb1684e-bfce-4b17-b617-f1f7d6cc8f9a' };

describe('entrega de email de produção', () => {
  afterEach(() => vi.useRealTimers());

  it('envia ao endpoint fixo com timeout e aceita apenas recibo válido', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(receipt));
    await expect(createMailTransport(settings, request).send(message)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    const call = request.mock.calls[0];
    if (!call) throw new Error('Expected the email request.');
    const [url, options] = call;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${settings.RESEND_API_KEY}` },
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(options?.body))).toEqual({
      from: settings.AUTH_EMAIL_FROM,
      ...message,
    });
  });

  it.each([302, 400, 401, 403, 429, 500, 503])(
    'recusa status %i sem retry nem expor o corpo do provedor',
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ message: `${settings.RESEND_API_KEY} ${message.text}` }, { status }),
        );
      await expect(createMailTransport(settings, request).send(message)).rejects.toThrow(
        'Email delivery was not confirmed.',
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(
    [{}, { id: '' }, { id: 'SENTINEL_PRIVATE_TOKEN' }, null, [], { id: 1 }].map((body) => ({
      body,
    })),
  )('recusa resposta 2xx sem identificação válida: %j', async ({ body }) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(createMailTransport(settings, request).send(message)).rejects.toThrow(
      'Email delivery was not confirmed.',
    );
  });

  it('sanitiza JSON inválido e falha de transporte', async () => {
    for (const request of [
      vi.fn<typeof fetch>().mockResolvedValue(new Response('SENTINEL_PRIVATE_RESPONSE')),
      vi.fn<typeof fetch>().mockRejectedValue(new Error('SENTINEL_PRIVATE_TRANSPORT')),
    ]) {
      const error = await createMailTransport(settings, request).send(message).catch(String);
      expect(error).toBe('Error: Email delivery was not confirmed.');
      expect(error).not.toContain('SENTINEL');
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it('aborta envio após cinco segundos e não repete a tentativa', async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('SENTINEL_TIMEOUT')));
        }),
    );
    const sending = createMailTransport(settings, request).send(message);
    const result = sending.catch(String);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toBe('Error: Email delivery was not confirmed.');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('mantém SMTP restrito ao loopback fora de produção', () => {
    const request = vi.fn<typeof fetch>();
    const local = createMailTransport(
      {
        NODE_ENV: 'test',
        AUTH_EMAIL_FROM: 'access@example.test',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: 1025,
      },
      request,
    );
    local.close();
    expect(request).not.toHaveBeenCalled();
    expect(() =>
      createMailTransport({
        NODE_ENV: 'test',
        AUTH_EMAIL_FROM: 'access@example.test',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
      }),
    ).toThrow('Invalid local email configuration.');
  });
});
