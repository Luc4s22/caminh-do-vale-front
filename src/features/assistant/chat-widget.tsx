import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useMatch } from "react-router-dom";
import { Bot, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataService } from "@/hooks/use-data-service";
import type { ChatTurn } from "@/types";

import { describeChatError } from "./chat-errors";

const MAX_CHARS = 1000;

interface Message {
  id: number;
  role: "user" | "model";
  text: string;
  /** Set on a user message whose answer failed. */
  error?: string;
  canRetry?: boolean;
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
        <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
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

function Typing() {
  return (
    <div className="flex items-center gap-2 text-xs text-[#5B7264]" role="status">
      <span className="flex gap-1 rounded-2xl rounded-bl-sm bg-[#F4FAF5] px-3 py-2.5">
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
  const detail = useMatch("/cargas/:id");
  const routeShipment = detail?.params.id;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [pausedUntil, setPausedUntil] = useState(0);
  // The trip page on which the user chose "all trips"; leaving that page goes back to the trip focus.
  const [generalOn, setGeneralOn] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const pausedFor = useCountdown(pausedUntil);

  // Inside a trip page the assistant answers about that trip, unless the user asks for all trips.
  const generalMode = !!routeShipment && generalOn === routeShipment;
  const shipmentId = routeShipment && !generalMode ? routeShipment : undefined;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, waiting, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

  const suggestions = shipmentId
    ? [`Como está a temperatura da ${shipmentId}?`, `A carga ${shipmentId} teve algum alerta?`, "A carga está dentro dos limites ideais?"]
    : ["Como estão minhas cargas agora?", "Alguma viagem tem alerta aberto?", "Qual a temperatura ideal para manga?"];

  const tooLong = draft.length > MAX_CHARS;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-20 z-[1050] flex h-14 w-14 items-center justify-center rounded-full bg-[#1A7A44] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#16643A] focus:outline-none focus:ring-4 focus:ring-[#1F8A4D]/30 lg:right-6 lg:bottom-6"
          aria-label={shipmentId ? `Perguntar ao assistente sobre ${shipmentId}` : "Abrir o assistente"}
        >
          <MessageCircle className="h-6 w-6" />
          {shipmentId && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#F2C94C]" />}
        </button>
      )}

      {open && (
        <section
          className="fixed inset-x-2 top-16 bottom-20 z-[1050] flex flex-col overflow-hidden rounded-2xl border border-[#E6F4EA] bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:top-auto sm:h-[min(600px,calc(100vh-7rem))] sm:w-[400px] lg:right-6 lg:bottom-6"
          role="dialog"
          aria-label="Assistente Caminho do Vale"
        >
          <header className="flex items-center gap-3 bg-[#1A7A44] px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Bot className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Assistente</h2>
              <p className="truncate text-xs text-[#BFE3C8]">Pergunte sobre suas viagens e cargas</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                disabled={waiting}
                className="rounded-md px-2 py-1 text-xs text-[#BFE3C8] hover:bg-white/10 hover:text-white"
              >
                Limpar
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/10" aria-label="Fechar o assistente">
              <X className="h-5 w-5" />
            </button>
          </header>

          {routeShipment && (
            <div className="flex items-center justify-between gap-2 border-b border-[#E6F4EA] bg-[#F4FAF5] px-4 py-2 text-xs text-[#123A24]">
              <span>{generalMode ? "Falando de todas as suas viagens" : <>Falando sobre a carga <b>{routeShipment}</b></>}</span>
              <button type="button" onClick={() => setGeneralOn(generalMode ? null : routeShipment)} className="font-medium text-[#1A7A44] hover:underline">
                {generalMode ? `Voltar para ${routeShipment}` : "Todas as viagens"}
              </button>
            </div>
          )}

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3 pt-2 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-[#F2C94C]" />
                <p className="text-sm text-[#5B7264]">
                  Eu consulto as leituras, os alertas e os limites das suas cargas. Experimente:
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      disabled={waiting || pausedFor > 0}
                      className="rounded-xl border border-[#BFE3C8] px-3 py-2 text-left text-sm text-[#123A24] hover:bg-[#F4FAF5] disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex flex-col items-end gap-1">
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap",
                      m.error ? "border border-[#D94F4F]/40 bg-[#FCE8E6] text-[#123A24]" : "bg-[#1A7A44] text-white"
                    )}
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
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-[#1A7A44] hover:bg-[#E6F4EA] disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {pausedFor > 0 ? `Tentar em ${formatWait(pausedFor)}` : "Tentar de novo"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className="max-w-[90%] rounded-2xl rounded-bl-sm bg-[#F4FAF5] px-3 py-2 text-sm text-[#123A24]">
                  <RichText text={m.text} />
                </div>
              )
            )}

            {waiting && <Typing />}
          </div>

          <form
            className="border-t border-[#E6F4EA] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <div className="flex items-end gap-2">
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
                placeholder={pausedFor > 0 ? `Aguarde ${formatWait(pausedFor)} para enviar` : "Escreva sua pergunta…"}
                aria-label="Mensagem para o assistente"
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-[#BFE3C8]/60 px-3 py-2 text-sm text-[#123A24] placeholder:text-[#5B7264] focus:border-[#1F8A4D] focus:outline-none focus:ring-2 focus:ring-[#1F8A4D]/20"
              />
              <button
                type="submit"
                disabled={!draft.trim() || tooLong || waiting || pausedFor > 0}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A7A44] text-white hover:bg-[#16643A] disabled:opacity-40"
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className={cn("mt-1 text-right text-[11px]", tooLong ? "font-semibold text-[#B03A3A]" : "text-[#5B7264]")}>
              {draft.length}/{MAX_CHARS}
            </p>
          </form>
        </section>
      )}
    </>
  );
}
