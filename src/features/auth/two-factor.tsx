import { useState } from "react";
import { Check, Copy, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { regenerateRecoveryCodes } from "@/hooks/use-session";

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      aria-label="Código de 6 dígitos do aplicativo autenticador"
      className="h-14 w-full rounded-xl border border-[#BFE3C8] bg-white text-center font-mono text-3xl tracking-[0.5em] text-[#123A24] placeholder:text-[#BFE3C8] focus:border-[#1F8A4D] focus:outline-none focus:ring-2 focus:ring-[#1F8A4D]/20 disabled:opacity-60"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      placeholder="000000"
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
        onChange(digits);
        if (digits.length === 6) onComplete(digits);
      }}
    />
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1A7A44] hover:bg-[#E6F4EA]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : label}
    </button>
  );
}

function downloadCodes(codes: string[]) {
  const text = [
    "Caminho do Vale — códigos de recuperação",
    "Cada código entra uma única vez, se você perder o acesso ao aplicativo autenticador.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "caminho-do-vale-codigos-de-recuperacao.txt" });
  a.click();
  URL.revokeObjectURL(url);
}

/** Recovery codes are shown only once, so the user has to confirm they kept them before moving on. */
export function RecoveryCodesPanel({ codes, onContinue, continueLabel }: { codes: string[]; onContinue: () => void; continueLabel: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#5B7264]">
        Guarde estes códigos em um lugar seguro. Cada um permite entrar <b className="text-[#123A24]">uma única vez</b> se você
        perder o celular. Eles não aparecem de novo.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-[#E6F4EA] bg-[#F4FAF5] p-3 font-mono text-sm text-[#123A24]">
        {codes.map((c) => (
          <li key={c} className="rounded-md bg-white px-2 py-1.5 text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-2">
        <CopyButton text={codes.join("\n")} label="Copiar códigos" />
        <button
          type="button"
          onClick={() => downloadCodes(codes)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1A7A44] hover:bg-[#E6F4EA]"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar .txt
        </button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#FEF3E6] px-3 py-2 text-sm text-[#123A24]">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-[#1A7A44]" />
        Guardei os códigos em um lugar seguro
      </label>
      <Button size="lg" className="w-full" disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </Button>
    </div>
  );
}

/** Asks for a current authenticator code; the backend then invalidates the old recovery codes. */
export function RegenerateRecoveryCodesDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(value: string) {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      setCodes(await regenerateRecoveryCodes(value));
    } catch (err) {
      setCode("");
      setError(err instanceof Error ? err.message : "Não foi possível gerar os códigos.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-codes-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="recovery-codes-title" className="text-base font-semibold text-[#123A24]">
            Novos códigos de recuperação
          </h2>
          {/* Once new codes exist the old ones are gone, so closing must go through the "saved" confirmation. */}
          {!codes && (
            <button type="button" onClick={onClose} className="rounded-md p-1 text-[#5B7264] hover:bg-[#F4FAF5]" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {codes ? (
          <div className="mt-4">
            <RecoveryCodesPanel codes={codes} continueLabel="Concluir" onContinue={onClose} />
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-[#5B7264]">
              Os códigos antigos deixam de funcionar. Para confirmar, digite o código de 6 dígitos do aplicativo autenticador.
            </p>
            <CodeInput value={code} onChange={setCode} onComplete={submit} disabled={submitting} />
            {error && (
              <p className="rounded-lg bg-[#FCE8E6] px-3 py-2 text-sm text-[#B03A3A]" role="alert">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={submitting || code.length !== 6} onClick={() => submit(code)}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Gerar novos códigos
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
