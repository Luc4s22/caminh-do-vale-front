import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeChatError } from "../chat-errors";
import { ApiDataProvider } from "../../../services/api/api-provider";
import { ApiError } from "../../../services/api/http";
import { setSession } from "../../../services/api/session";

let fetchMock: ReturnType<typeof vi.fn>;
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  setSession({ access: "a", refresh: "r", user: { id: 5, name: "Comprador", email: "c@example.com", role: "buyer" } });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
});

describe("askAssistant", () => {
  it("sends the trip id and only the last 6 turns of history", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: { answer: "Está a 12 °C.", shipments: [13] } }));
    const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? ("model" as const) : ("user" as const), text: `m${i}` }));
    const answer = await new ApiDataProvider().askAssistant("Como está?", { shipmentId: "VG-13", history });
    expect(answer).toBe("Está a 12 °C.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toMatch(/\/chat$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ message: "Como está?", shipment_id: 13 });
    expect(body.history.map((h: { text: string }) => h.text)).toEqual(["m2", "m3", "m4", "m5", "m6", "m7"]);
  });

  it("omits shipment_id outside a trip page", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: { answer: "ok", shipments: [] } }));
    await new ApiDataProvider().askAssistant("Oi", { history: [] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ message: "Oi", history: [] });
  });

  it("keeps the error code and Retry-After of a 429", async () => {
    fetchMock.mockResolvedValueOnce(reply({ detail: "Você enviou muitas mensagens seguidas." }, 429, { "Retry-After": "42" }));
    await expect(new ApiDataProvider().askAssistant("Oi", { history: [] })).rejects.toMatchObject({ status: 429, retryAfter: 42 });

    fetchMock.mockResolvedValueOnce(reply({ detail: "O limite gratuito do assistente foi atingido.", code: "assistant_quota_exceeded" }, 429));
    await expect(new ApiDataProvider().askAssistant("Oi", { history: [] })).rejects.toMatchObject({ code: "assistant_quota_exceeded" });
  });
});

describe("describeChatError", () => {
  it("tells the two 429s apart", () => {
    const rate = describeChatError(new ApiError("Aguarde um pouco.", 429, { retryAfter: 30 }), false);
    expect(rate).toEqual({ message: "Aguarde um pouco.", canRetry: true, pauseMs: 30_000 });

    const quota = describeChatError(new ApiError("Limite atingido.", 429, { code: "assistant_quota_exceeded" }), false);
    expect(quota.message).toContain("Assistente indisponível");
    expect(quota.pauseMs).toBe(15 * 60_000);
  });

  it("waits a minute when Retry-After is not readable", () => {
    expect(describeChatError(new ApiError("Aguarde.", 429), false).pauseMs).toBe(60_000);
  });

  it("lets the user retry when the assistant is unavailable, but not an invalid message", () => {
    expect(describeChatError(new ApiError("Tente de novo em instantes.", 503, { code: "assistant_unavailable" }), false).canRetry).toBe(true);
    expect(describeChatError(new ApiError("Escreva uma mensagem de até 1000 caracteres.", 400, { code: "invalid_message" }), false)).toEqual({
      message: "Escreva uma mensagem de até 1000 caracteres.",
      canRetry: false,
    });
  });

  it("says the trip was not found only when the chat was about a trip", () => {
    expect(describeChatError(new ApiError("Viagem não encontrada.", 404), true).message).toContain("Viagem não encontrada");
    expect(describeChatError(new ApiError("Não encontrado.", 404), false).message).toContain("ainda não está disponível");
  });
});
