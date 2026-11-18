import { ApiError } from "@/services/api/http";

/** Fallback when the 429 has no readable Retry-After (cross-origin hides it). */
const DEFAULT_WAIT_S = 60;
/** The free Gemini quota is gone: stop sending for a while instead of failing every message. */
const QUOTA_PAUSE_MS = 15 * 60_000;

interface ChatFailure {
  message: string;
  canRetry: boolean;
  pauseMs?: number;
}

export function describeChatError(error: unknown, askedAboutShipment: boolean): ChatFailure {
  if (!(error instanceof ApiError)) return { message: "Não foi possível falar com o assistente.", canRetry: true };
  if (error.status === 400) return { message: error.message, canRetry: false };
  if (error.status === 404) {
    return askedAboutShipment
      ? { message: "Viagem não encontrada. Ela não existe ou você não tem acesso a ela.", canRetry: false }
      : { message: "O assistente ainda não está disponível neste servidor.", canRetry: false };
  }
  if (error.status === 429 && error.code === "assistant_quota_exceeded") {
    return { message: `Assistente indisponível por agora. ${error.message}`, canRetry: true, pauseMs: QUOTA_PAUSE_MS };
  }
  if (error.status === 429) {
    return { message: error.message, canRetry: true, pauseMs: (error.retryAfter ?? DEFAULT_WAIT_S) * 1000 };
  }
  if (error.status === 503) return { message: error.message || "Tente de novo em instantes.", canRetry: true };
  return { message: error.message, canRetry: error.status === 0 || error.status >= 500 };
}
