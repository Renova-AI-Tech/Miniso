import { Button } from '@renova/ui/components/ui/button';
import { Input } from '@renova/ui/components/ui/input';
import { useEffect, useState, type FormEvent } from 'react';
import { authPost, readableError } from '../auth/client';

type Mode = 'login' | 'activate' | 'recover' | 'reset';
const copy = {
  login: {
    title: 'Bem-vindo de volta.',
    action: 'Entrar',
    description: 'Use o e-mail liberado pelo responsável pelo projeto.',
  },
  activate: {
    title: 'Prepare seu acesso.',
    action: 'Ativar acesso',
    description: 'Crie uma senha para começar a usar sua conta.',
  },
  recover: {
    title: 'Vamos recuperar seu acesso.',
    action: 'Enviar instruções',
    description: 'Informe seu e-mail. Se houver uma conta liberada, você receberá as instruções.',
  },
  reset: {
    title: 'Escolha uma nova senha.',
    action: 'Salvar nova senha',
    description: 'Ao salvar, você precisará entrar novamente nos seus dispositivos.',
  },
} as const;

export function AuthPage({ mode }: { mode: Mode }) {
  // O token permanece apenas em memória. Removê-lo da URL evita compartilhá-lo por engano.
  const [token] = useState(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get('token') ?? '';
  });
  useEffect(() => {
    if (token) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const newPassword = mode === 'activate' || mode === 'reset';
  const unavailable = newPassword && !token;
  const content = copy[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (newPassword && (password.length < 15 || password.length > 128)) {
      setError('Use uma senha com 15 a 128 caracteres. Nenhum caractere será removido.');
      return;
    }
    if (newPassword && password !== confirmation) {
      setError('As senhas não são iguais. Confira os dois campos.');
      return;
    }
    setPending(true);
    try {
      if (mode === 'login') {
        await authPost(
          'sign-in/email',
          { email, password },
          'Não foi possível entrar. Confira o e-mail e a senha ou recupere seu acesso.',
        );
        window.location.replace('/');
      } else if (mode === 'recover') {
        await authPost(
          'request-password-reset',
          { email, redirectTo: new URL('/redefinir-senha', window.location.origin).href },
          'Se houver uma conta liberada, as instruções serão enviadas. Se não chegarem, tente novamente mais tarde ou fale com o responsável.',
        );
        setComplete(true);
      } else {
        await authPost(
          'reset-password',
          { token, newPassword: password },
          'Este link não está disponível. Ele pode ter expirado ou já ter sido usado. Solicite um novo link.',
        );
        setPassword('');
        setConfirmation('');
        setComplete(true);
      }
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-shell">
      <title>{`${content.action} · ${__PROJECT_NAME__}`}</title>
      <header className="auth-brand">
        <img src="/renova-logo.png" alt="Renova Consulting Group" width="2846" height="660" />
        <span>{__PROJECT_NAME__}</span>
      </header>
      <main className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Seu espaço no projeto</p>
        <h1 id="auth-title">{content.title}</h1>
        {complete ? (
          <div className="auth-result" role="status">
            <h2>{mode === 'recover' ? 'Confira seu e-mail' : 'Tudo pronto para entrar'}</h2>
            <p>
              {mode === 'recover'
                ? 'Se houver uma conta liberada, você receberá um link válido por 15 minutos. Confira também a pasta de spam. Se não chegar, fale com o responsável.'
                : 'Sua senha foi salva. Entre com seu e-mail e a nova senha.'}
            </p>
            <Button asChild>
              <a href="/entrar">Ir para entrar</a>
            </Button>
          </div>
        ) : unavailable ? (
          <div className="auth-result">
            <p role="alert">
              Este link não está disponível. Abra o link completo recebido por e-mail ou solicite
              outro.
            </p>
            <Button asChild>
              <a href="/recuperar">Solicitar novo link</a>
            </Button>
          </div>
        ) : (
          <>
            <p className="auth-description">{content.description}</p>
            <form
              className="auth-form"
              onSubmit={submit}
              aria-label={content.action}
              aria-busy={pending}
            >
              {!newPassword && (
                <div className="field">
                  <label htmlFor="auth-email">E-mail</label>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={pending}
                  />
                </div>
              )}
              {mode !== 'recover' && (
                <div className="field">
                  <label htmlFor="auth-password">{newPassword ? 'Nova senha' : 'Senha'}</label>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={newPassword ? 'new-password' : 'current-password'}
                    required
                    minLength={newPassword ? 15 : undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={newPassword ? 'password-hint' : undefined}
                    disabled={pending}
                  />
                  {newPassword && (
                    <p id="password-hint" className="field-hint">
                      Use de 15 a 128 caracteres. Uma frase longa e única é uma boa escolha. Você
                      pode usar um gerenciador de senhas.
                    </p>
                  )}
                </div>
              )}
              {newPassword && (
                <div className="field">
                  <label htmlFor="auth-confirmation">Repita a nova senha</label>
                  <Input
                    id="auth-confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={15}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    disabled={pending}
                  />
                </div>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? 'Aguarde…' : content.action}
              </Button>
            </form>
            <nav className="auth-links" aria-label="Ajuda para acessar">
              {mode === 'login' ? (
                <a href="/recuperar">Esqueci minha senha</a>
              ) : (
                <a href="/entrar">Voltar para entrar</a>
              )}
              {newPassword && <a href="/recuperar">Solicitar novo link</a>}
            </nav>
          </>
        )}
        <p className="auth-note">
          O acesso é liberado pelo responsável pelo projeto. Ainda não recebeu um convite? Fale com
          essa pessoa.
        </p>
      </main>
      <footer className="auth-footer">
        <a href="/referência">Referência de componentes</a>
      </footer>
    </div>
  );
}
