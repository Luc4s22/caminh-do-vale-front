import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft, KeyRound, Loader2, LogIn, ShieldCheck, Smartphone } from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  activateAuthenticator,
  finishLogin,
  login,
  startAuthenticatorSetup,
  useSession,
  verifyLoginCode,
} from "@/hooks/use-session";
import { API_BASE_URL, ApiError } from "@/services/api/http";
import type { Session } from "@/services/api/session";
import type { ApiMfaSetup } from "@/services/api/backend-types";
import { InstallAppButton } from "@/components/layout/install-app-button";
import { CodeInput, CopyButton, RecoveryCodesPanel } from "./two-factor";
import { AuthError, AuthShell } from "./auth-shell";

type ServerState = "waking" | "ready" | "unreachable";

function useWakeServer(): ServerState {
  const [state, setState] = useState<ServerState>("waking");
  useEffect(() => {
    let cancelled = false;
    // no-cors: this request only wakes the server, so it must not depend on CORS being configured.
    fetch(`${API_BASE_URL}/`, { mode: "no-cors", signal: AbortSignal.timeout(90_000) })
      .then(() => !cancelled && setState("ready"))
      .catch(() => !cancelled && setState("unreachable"));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

const serverLabel: Record<ServerState, string> = {
  waking: "Conectando ao servidor… a primeira conexão pode levar até 1 minuto.",
  ready: "Servidor conectado.",
  unreachable: "Não foi possível falar com o servidor. Verifique sua internet.",
};

// The mfa_token lives only in this component's state, never in storage.
type Step =
  | { kind: "credentials" }
  | { kind: "setup"; mfaToken: string; setup?: ApiMfaSetup }
  | { kind: "verify"; mfaToken: string; recovery: boolean }
  | { kind: "codes"; session: Session; codes: string[] };

const isTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

export default function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const server = useWakeServer();
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  function backToCredentials(message?: string) {
    setStep({ kind: "credentials" });
    setExpiresAt(null);
    setCode("");
    setRecoveryCode("");
    setNotice(null);
    setError(message ?? null);
  }

  function handleStepError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) return backToCredentials(err.message);
    setCode("");
    setError(err instanceof Error ? err.message : "Não foi possível concluir.");
  }

  // The code step is only valid for expires_in seconds.
  useEffect(() => {
    if (!expiresAt || step.kind === "codes" || step.kind === "credentials") return;
    const id = setTimeout(
      () => backToCredentials("O tempo para digitar o código acabou. Entre com e-mail e senha de novo."),
      Math.max(expiresAt - Date.now(), 0)
    );
    return () => clearTimeout(id);
  }, [expiresAt, step.kind]);

  // First access: fetch the QR code as soon as the setup step opens.
  const setupToken = step.kind === "setup" && !step.setup ? step.mfaToken : null;
  useEffect(() => {
    if (!setupToken) return;
    let cancelled = false;
    startAuthenticatorSetup(setupToken)
      .then((setup) => !cancelled && setStep({ kind: "setup", mfaToken: setupToken, setup }))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 400 && err.message.includes("já está configurado")) {
          setNotice("O autenticador já está configurado nesta conta. Digite o código do aplicativo.");
          setStep({ kind: "verify", mfaToken: setupToken, recovery: false });
        } else handleStepError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [setupToken]);

  if (session) return <Navigate to={from} replace />;

  async function run(action: () => Promise<void>) {
    setError(null);
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      handleStepError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const submitCredentials = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const result = await login(email.trim(), password);
      if (result.step === "done") return;
      setPassword("");
      setExpiresAt(Date.now() + result.expiresIn * 1000);
      setStep(result.setupRequired ? { kind: "setup", mfaToken: result.mfaToken } : { kind: "verify", mfaToken: result.mfaToken, recovery: false });
    });
  };

  const submitActivation = (value: string) => {
    if (step.kind !== "setup" || submitting) return;
    return run(async () => {
      const { session: pending, recoveryCodes } = await activateAuthenticator(step.mfaToken, value);
      setStep({ kind: "codes", session: pending, codes: recoveryCodes });
    });
  };

  const submitVerification = (value: string) => {
    if (step.kind !== "verify" || submitting) return;
    return run(() =>
      verifyLoginCode(step.mfaToken, step.recovery ? { recoveryCode: value.trim().toUpperCase() } : { code: value })
    );
  };

  const titles: Record<Step["kind"], [string, string]> = {
    credentials: ["Entrar no painel", ""],
    setup: ["Configurar o autenticador", "Primeiro acesso: proteja sua conta com um código do celular."],
    verify: ["Digite o código", "Abra o aplicativo autenticador e digite o código de 6 dígitos."],
    codes: ["Guarde seus códigos de recuperação", "Tudo pronto. Falta só guardar estes códigos."],
  };
  const [title, subtitle] = titles[step.kind];

  return (
    <AuthShell>
          <h1 className="mt-6 text-center text-xl font-bold text-[#123A24]">{title}</h1>
          <p className="mt-1 text-center text-sm text-[#5B7264]">
            {subtitle || (
              <>
                Monitorando cada carga, <span className="font-semibold text-[#1A7A44]">do vale ao destino.</span>
              </>
            )}
          </p>

          {step.kind === "credentials" && (
            <form onSubmit={submitCredentials} className="mt-6 space-y-4" noValidate>
              <Input id="email" label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <Input id="password" label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {error && <AuthError>{error}</AuthError>}
              <Button type="submit" size="lg" className="w-full" disabled={submitting || !email || !password}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {submitting ? "Entrando…" : "Entrar"}
              </Button>
              <Link to="/redefinir-senha" className="block text-center text-sm font-medium text-[#1A7A44] hover:underline">
                Esqueci minha senha
              </Link>
            </form>
          )}

          {step.kind === "setup" && (
            <div className="mt-6 space-y-4">
              <ol className="space-y-1 text-sm text-[#123A24]">
                <li>1. Instale um app autenticador (Google Authenticator, Microsoft Authenticator...) e leia o QR Code.</li>
                <li>2. Digite o código de 6 dígitos que aparecer no app.</li>
              </ol>
              {step.setup ? (
                <>
                  <img src={step.setup.qr_code} alt="QR code para o aplicativo autenticador" className="mx-auto h-48 w-48 rounded-xl border border-[#E6F4EA] p-2" />
                  {isTouch && (
                    <a
                      href={step.setup.otpauth_uri}
                      className="flex items-center justify-center gap-2 rounded-lg border border-[#BFE3C8] py-2 text-sm font-semibold text-[#1A7A44] hover:bg-[#E6F4EA]"
                    >
                      <Smartphone className="h-4 w-4" />
                      Abrir no aplicativo autenticador
                    </a>
                  )}
                  <div className="rounded-lg bg-[#F4FAF5] px-3 py-2 text-xs text-[#5B7264]">
                    Não consegue ler o QR? Digite este código no aplicativo:
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <code className="break-all font-mono text-sm text-[#123A24]">{step.setup.secret}</code>
                      <CopyButton text={step.setup.secret} />
                    </div>
                  </div>
                  <CodeInput value={code} onChange={setCode} onComplete={submitActivation} disabled={submitting} />
                  {error && <AuthError>{error}</AuthError>}
                  <Button size="lg" className="w-full" disabled={submitting || code.length !== 6} onClick={() => submitActivation(code)}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Ativar e entrar
                  </Button>
                </>
              ) : error ? (
                <AuthError>{error}</AuthError>
              ) : (
                <p className="flex items-center justify-center gap-2 py-10 text-sm text-[#5B7264]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerando o QR code…
                </p>
              )}
            </div>
          )}

          {step.kind === "verify" && (
            <div className="mt-6 space-y-4">
              {notice && <p className="rounded-lg bg-[#E6F4EA] px-3 py-2 text-sm text-[#1A7A44]">{notice}</p>}
              {step.recovery ? (
                <Input
                  id="recovery"
                  label="Código de recuperação"
                  placeholder="ABCD-EFGH"
                  autoComplete="off"
                  autoFocus
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && recoveryCode.trim() && submitVerification(recoveryCode)}
                />
              ) : (
                <CodeInput value={code} onChange={setCode} onComplete={submitVerification} disabled={submitting} />
              )}
              {error && <AuthError>{error}</AuthError>}
              <Button
                size="lg"
                className="w-full"
                disabled={submitting || (step.recovery ? !recoveryCode.trim() : code.length !== 6)}
                onClick={() => submitVerification(step.recovery ? recoveryCode : code)}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Entrar
              </Button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-[#1A7A44] hover:underline"
                onClick={() => {
                  setError(null);
                  setCode("");
                  setRecoveryCode("");
                  setStep({ ...step, recovery: !step.recovery });
                }}
              >
                <KeyRound className="h-4 w-4" />
                {step.recovery ? "Usar o código do aplicativo" : "Perdi meu celular · usar código de recuperação"}
              </button>
            </div>
          )}

          {step.kind === "codes" && (
            <div className="mt-6">
              <RecoveryCodesPanel codes={step.codes} continueLabel="Entrar no painel" onContinue={() => finishLogin(step.session)} />
            </div>
          )}

          {(step.kind === "setup" || step.kind === "verify") && (
            <button
              type="button"
              onClick={() => backToCredentials()}
              className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-[#5B7264] hover:text-[#123A24]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar para e-mail e senha
            </button>
          )}

          {step.kind === "credentials" && (
            <>
              <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-[#5B7264]" aria-live="polite">
                {server === "waking" && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                {server === "ready" && <span className="h-2 w-2 shrink-0 rounded-full bg-[#1F8A4D]" />}
                {server === "unreachable" && <span className="h-2 w-2 shrink-0 rounded-full bg-[#D94F4F]" />}
                {serverLabel[server]}
              </p>
              <div className="mt-4 border-t border-[#E6F4EA] pt-4 text-center empty:hidden">
                <InstallAppButton variant="inline" />
              </div>
            </>
          )}
    </AuthShell>
  );
}
