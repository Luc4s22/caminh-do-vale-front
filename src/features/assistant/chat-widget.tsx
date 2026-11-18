import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useMatch } from "react-router-dom";
import { AlertTriangle, ArrowUp, Leaf, RotateCcw, Sparkles, SquarePen, Thermometer, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataService } from "@/hooks/use-data-service";
import { useSession } from "@/hooks/use-session";
import type { ChatTurn } from "@/types";
import logoIcon from "@/assets/brand/logo-icon-original.png";
import { describeChatError } from "./chat-errors";
import { onOpenAssistant } from "./open-assistant";

const MAX_CHARS = 1000;
const SEEN_KEY = "cdv.assistant.seen";
const BRAND_GRADIENT = "linear-gradient(145deg, #1a7a44 0%, #1F8A4D 35%, #16643A 75%, #124e2e 100%)";

interface Message {
  id: number;
  role: "user" | "model";
  text: string;
  /** Set on a user message whose answer failed. */
  error?: string;
  canRetry?: boolean;
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: the glow just shows again next time.
  }
}

/** Gemini answers in light Markdown; render **bold** and "- " lists without injecting HTML. */
function RichText({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
    );
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5 marker:text-[#1F8A4D]">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      );
    }
    list = [];
  };
  for (const raw of text.split("\n")) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(raw);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (raw.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(raw)}</p>);
  }
  flush();
  return <div className="space-y-1.5">{blocks}</div>;
}

function Avatar({ size = "h-7 w-7" }: { size?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-[#E6F4EA]", size)}>
      <img src={logoIcon} alt="" className="h-[78%] w-[78%] object-contain" />
    </span>
  );
}

function Typing() {
  return (
    <div className="assistant-in flex items-end gap-2 text-xs text-[#5B7264]" role="status">
      <Avatar />
      <span className="flex gap-1 rounded-2xl rounded-bl-md border border-[#E6F4EA] bg-white px-3 py-3 shadow-sm">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#1A7A44] motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      digitando…
    </div>
  );
}

const secondsUntil = (until: number) => Math.max(0, Math.ceil((until - Date.now()) / 1000));
const deadlineIn = (ms: number) => Date.now() + ms;
const formatWait = (s: number) => (s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`);

/** Seconds left until `until` (a timestamp), ticking every second; 0 when not paused. */
function useCountdown(until: number): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(secondsUntil(until));
    tick();
    if (secondsUntil(until) === 0) return;
    const id = setInterval(() => {
      tick();
      if (secondsUntil(until) === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  return left;
}

export function ChatWidget() {
  const service = useDataService();
  const firstName = useSession()?.user.name.split(" ")[0];
  const detail = useMatch("/cargas/:id");
  const routeShipment = detail?.params.id;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [pausedUntil, setPausedUntil] = useState(0);
  // The trip page on which the user chose "all trips"; leaving that page goes back to the trip focus.
  const [generalOn, setGeneralOn] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const askRef = useRef<(question: string) => void>(() => {});
  const pausedFor = useCountdown(pausedUntil);

  // Inside a trip page the assistant answers about that trip, unless the user asks for all trips.
  const generalMode = !!routeShipment && generalOn === routeShipment;
  const shipmentId = routeShipment && !generalMode ? routeShipment : undefined;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, waiting, open]);

  // Other screens (the trip page) can open the assistant and send a question.
  useEffect(
    () =>
      onOpenAssistant((question) => {
        setOpen(true);
        if (question) askRef.current(question);
      }),
    []
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openPanel() {
    setOpen(true);
    if (!seen) {
      markSeen();
      setSeen(true);
    }
  }

  async function ask(text: string, retryOf?: number) {
    const message = text.trim();
    if (!message || message.length > MAX_CHARS || waiting || pausedFor > 0) return;

    // Only answered exchanges go to the backend as history.
    const history: ChatTurn[] = messages
      .filter((m) => !m.error && m.id !== retryOf)
      .map(({ role, text: t }) => ({ role, text: t }));

    const id = retryOf ?? nextId.current++;
    setMessages((list) =>
      retryOf ? list.map((m) => (m.id === retryOf ? { ...m, error: undefined, canRetry: undefined } : m)) : [...list, { id, role: "user", text: message }]
    );
    if (!retryOf) setDraft("");
    setWaiting(true);
    try {
      const answer = await service.askAssistant(message, { shipmentId, history });
      setMessages((list) => [...list, { id: nextId.current++, role: "model", text: answer }]);
    } catch (error) {
      const failure = describeChatError(error, !!shipmentId);
      if (failure.pauseMs) setPausedUntil(deadlineIn(failure.pauseMs));
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, error: failure.message, canRetry: failure.canRetry } : m)));
    } finally {
      setWaiting(false);
    }
  }

  useEffect(() => {
    askRef.current = (question) => void ask(question);
  });

  const suggestions = shipmentId
    ? [
        { icon: Thermometer, text: `Como está a temperatura da ${shipmentId}?` },
        { icon: AlertTriangle, text: `A carga ${shipmentId} teve algum alerta?` },
        { icon: Leaf, text: "A carga está dentro dos limites ideais?" },
      ]
    : [
        { icon: Truck, text: "Como estão minhas cargas agora?" },
        { icon: AlertTriangle, text: "Alguma viagem tem alerta aberto?" },
        { icon: Thermometer, text: "Qual a temperatura ideal para manga?" },
      ];

  const tooLong = draft.length > MAX_CHARS;
  const canSend = !!draft.trim() && !tooLong && !waiting && pausedFor === 0;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          style={{ background: BRAND_GRADIENT }}
          className={cn(
            "group fixed right-4 bottom-20 z-[1050] flex h-14 items-center gap-3 rounded-full p-1.5 text-white shadow-[0_12px_28px_-10px_rgba(22,100,58,0.65)] ring-2 ring-[#F2C94C]/80 transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F2C94C] sm:pr-5 lg:right-6 lg:bottom-6",
            !seen && "assistant-glow"
          )}
          aria-label={shipmentId ? `Perguntar ao assistente sobre ${shipmentId}` : "Abrir o assistente"}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F2C94C] text-[#123A24] transition-transform duration-300 group-hover:rotate-12">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-bold">Assistente</span>
            <span className="block text-[11px] text-[#D7EEDD]">
              {shipmentId ? `Pergunte sobre a ${shipmentId}` : "Pergunte sobre suas cargas"}
            </span>
          </span>
        </button>
      )}

      {open && (
        <section
          className="assistant-pop fixed inset-x-2 top-16 bottom-20 z-[1050] flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-12px_rgba(18,58,36,0.45)] ring-1 ring-[#123A24]/10 sm:inset-x-auto sm:top-auto sm:right-4 sm:h-[min(640px,calc(100vh-7rem))] sm:w-[420px] lg:right-6 lg:bottom-6"
          role="dialog"
          aria-label="Assistente Caminho do Vale"
        >
          <header className="relative overflow-hidden px-5 pt-4 pb-4 text-white" style={{ background: BRAND_GRADIENT }}>
            <div
              className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full opacity-30"
              style={{ background: "radial-gradient(circle, #F2C94C 0%, transparent 70%)" }}
            />
            <div className="relative flex items-center gap-3">
              <span className="relative">
                <Avatar size="h-11 w-11" />
                <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#F2C94C] text-[#123A24] ring-2 ring-[#16643A]">
                  <Sparkles className="h-3 w-3" />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display truncate text-base leading-tight font-bold">Assistente Caminho do Vale</h2>
                <p className="mt-0.5 truncate text-xs text-[#D7EEDD]">Inteligência artificial que conhece suas cargas</p>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  disabled={waiting}
                  className="rounded-lg p-1.5 text-[#D7EEDD] hover:bg-white/10 hover:text-white"
                  aria-label="Nova conversa"
                  title="Nova conversa"
                >
                  <SquarePen className="h-[18px] w-[18px]" />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Fechar o assistente">
                <X className="h-5 w-5" />
              </button>
            </div>
            {routeShipment && (
              <div className="relative mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/15 px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-[#F2C94C]" />
                  {generalMode ? (
                    "Falando de todas as suas viagens"
                  ) : (
                    <>
                      Falando sobre a carga <b className="text-[#F2C94C]">{routeShipment}</b>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setGeneralOn(generalMode ? null : routeShipment)}
                  className="font-semibold text-white underline-offset-2 hover:underline"
                >
                  {generalMode ? `Voltar para ${routeShipment}` : "Todas as viagens"}
                </button>
              </div>
            )}
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto bg-[#F4FAF5] px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="assistant-in space-y-3 pt-1">
                <div className="rounded-2xl border border-[#E6F4EA] bg-white p-4 shadow-sm">
                  <p className="font-display text-lg font-bold text-[#123A24]">
                    Olá{firstName ? `, ${firstName}` : ""}! <Sparkles className="inline h-4 w-4 text-[#E0A800]" />
                  </p>
                  <p className="mt-1 text-sm text-[#5B7264]">
                    Eu consulto as leituras, os alertas e os limites ideais das suas cargas e respondo em segundos.
                  </p>
                </div>
                <p className="px-1 pt-1 text-[11px] font-semibold tracking-wide text-[#1A7A44] uppercase">Experimente perguntar</p>
                <div className="flex flex-col gap-2">
                  {suggestions.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => ask(text)}
                      disabled={waiting || pausedFor > 0}
                      className="group flex items-center gap-3 rounded-2xl border border-[#E6F4EA] bg-white px-3 py-2.5 text-left text-sm font-medium text-[#123A24] shadow-sm transition hover:-translate-y-0.5 hover:border-[#BFE3C8] hover:shadow-md disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FDF6DC] text-[#B7860B] transition-colors group-hover:bg-[#F2C94C] group-hover:text-[#123A24]">
                        <Icon className="h-4 w-4" />
                      </span>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="assistant-in flex flex-col items-end gap-1">
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-wrap shadow-sm",
                      m.error ? "border border-[#D94F4F]/40 bg-[#FCE8E6] text-[#123A24]" : "text-white"
                    )}
                    style={m.error ? undefined : { background: BRAND_GRADIENT }}
                  >
                    {m.text}
                  </p>
                  {m.error && (
                    <div className="flex max-w-[85%] flex-wrap items-center justify-end gap-2 text-xs text-[#B03A3A]" role="alert">
                      <span className="text-right">{m.error}</span>
                      {m.canRetry && (
                        <button
                          type="button"
                          onClick={() => ask(m.text, m.id)}
                          disabled={waiting || pausedFor > 0}
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-semibold text-[#1A7A44] shadow-sm hover:bg-[#E6F4EA] disabled:opacity-60"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {pausedFor > 0 ? `Tentar em ${formatWait(pausedFor)}` : "Tentar de novo"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className="assistant-in flex items-end gap-2">
                  <Avatar />
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[#E6F4EA] bg-white px-3.5 py-2.5 text-sm text-[#123A24] shadow-sm">
                    <RichText text={m.text} />
                  </div>
                </div>
              )
            )}

            {waiting && <Typing />}
          </div>

          <form
            className="border-t border-[#E6F4EA] bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-[#BFE3C8]/70 bg-[#F4FAF5] p-1.5 pl-3 transition focus-within:border-[#1F8A4D] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#1F8A4D]/10">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
                rows={1}
                placeholder={pausedFor > 0 ? `Aguarde ${formatWait(pausedFor)} para enviar` : "Pergunte sobre suas cargas…"}
                aria-label="Mensagem para o assistente"
                className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-[#123A24] placeholder:text-[#5B7264] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!canSend}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
                  canSend ? "bg-[#F2C94C] text-[#123A24] shadow-sm hover:bg-[#E8BB2E]" : "bg-[#E6F4EA] text-[#8CA596]"
                )}
                aria-label="Enviar"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-[#8CA596]">
              <span className="hidden sm:inline">Enter envia · Shift+Enter quebra a linha</span>
              <span className={cn("ml-auto", tooLong && "font-semibold text-[#B03A3A]")}>
                {draft.length}/{MAX_CHARS}
              </span>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
