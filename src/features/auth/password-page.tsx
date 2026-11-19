import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, KeyRound, Loader2, Mail, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { confirmPasswordReset, requestPasswordReset } from "@/services/api/admin-api";
import { AuthError, AuthShell } from "./auth-shell";

// Mirrors the backend's Django validators (minimum 8, not only digits); the backend has the final word.
const rules = [
  { label: "Pelo menos 8 caracteres", ok: (p: string) => p.length >= 8 },
  { label: "Não pode ser só números", ok: (p: string) => p.length > 0 && !/^\d+$/.test(p) },
];

function BackToLogin() {
  return (
    <Link to="/login" className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[#5B7264] hover:text-[#123A24]">
      <ArrowLeft className="h-3.5 w-3.5" />
      Voltar para o login
    </Link>
  );
}

/** Opened from the invite e-mail (first password) or from "Esqueci minha senha": ?uid=...&token=... */
function SetPassword({ uid, token }: { uid: string; token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const valid = rules.every((r) => r.ok(password)) && password === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    setBusy(true);
    try {
      await confirmPasswordReset(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível definir a senha.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F4EA] text-[#1A7A44]">
          <Check className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold text-[#123A24]">Senha definida!</h1>
        <p className="text-sm text-[#5B7264]">
          Agora entre com seu e-mail e a nova senha. No primeiro acesso você também vai configurar o aplicativo autenticador.
        </p>
        <Link
          to="/login"
          className="flex h-11 w-full items-center justify-center rounded-lg bg-[#1A7A44] text-sm font-semibold text-white hover:bg-[#16643A]"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mt-6 text-center text-xl font-bold text-[#123A24]">Defina sua senha</h1>
      <p className="mt-1 text-center text-sm text-[#5B7264]">
        Crie a senha que você vai usar para entrar no Caminho do Vale. Este link só pode ser usado uma vez.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Input
          id="new-password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <ul className="space-y-1 text-xs">
          {rules.map((r) => {
            const ok = r.ok(password);
            return (
              <li key={r.label} className={cn("flex items-center gap-1.5", ok ? "text-[#1A7A44]" : "text-[#5B7264]")}>
                {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {r.label}
              </li>
            );
          })}
          <li className="pl-5 text-[#5B7264]">Evite senhas comuns ou parecidas com seu nome e e-mail.</li>
        </ul>
        <Input
          id="confirm-password"
          label="Repita a senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirm && confirm !== password ? "As senhas não são iguais." : undefined}
        />
        {error && <AuthError>{error}</AuthError>}
        {error?.includes("inválido ou expirado") && (
          <p className="text-center text-xs text-[#5B7264]">
            O link vale 3 dias e só pode ser usado uma vez.{" "}
            <Link to="/redefinir-senha" className="font-medium text-[#1A7A44] hover:underline">
              Pedir um link novo
            </Link>
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy || !valid}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Salvar senha
        </Button>
      </form>
      <BackToLogin />
    </>
  );
}

/** "Esqueci minha senha": the backend e-mails a link back to this same screen. */
function RequestLink() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setBusy(true);
    try {
      setSent(await requestPasswordReset(email.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível pedir o link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mt-6 text-center text-xl font-bold text-[#123A24]">Esqueci minha senha</h1>
      <p className="mt-1 text-center text-sm text-[#5B7264]">
        Informe seu e-mail e enviaremos um link para você definir uma nova senha. Serve também para quem recebeu um
        convite que venceu.
      </p>
      {sent ? (
        <p className="mt-6 rounded-lg bg-[#E6F4EA] px-3 py-3 text-sm text-[#1A7A44]" role="status">
          {sent}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Input
            id="reset-email"
            label="E-mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          {error && <AuthError>{error}</AuthError>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar link
          </Button>
        </form>
      )}
      <BackToLogin />
    </>
  );
}

export default function PasswordPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid");
  const token = params.get("token");
  return <AuthShell>{uid && token ? <SetPassword uid={uid} token={token} /> : <RequestLink />}</AuthShell>;
}
