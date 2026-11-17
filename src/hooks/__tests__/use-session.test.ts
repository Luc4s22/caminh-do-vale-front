import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateAuthenticator, login, logout, regenerateRecoveryCodes, verifyLoginCode } from "../use-session";
import { getSession, setSession } from "../../services/api/session";

const user = { id: 5, name: "Vendedor Demo", email: "vendedor@example.com", role: "seller" as const };
const tokens = { access: "a", refresh: "r", user };

let fetchMock: ReturnType<typeof vi.fn>;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { path: new URL(url as string).pathname.replace("/api/v1", ""), body: JSON.parse(String(init.body)) };
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
});

describe("login", () => {
  it("keeps working with the backend that answers tokens directly", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: tokens }));
    expect(await login("vendedor@example.com", "x")).toEqual({ step: "done" });
    expect(getSession()).toMatchObject({ access: "a", user, twoFactor: false });
  });

  it("asks for the authenticator code without storing a session", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ data: { mfa_required: true, mfa_setup_required: false, mfa_token: "t", expires_in: 300 } })
    );
    expect(await login("vendedor@example.com", "x")).toEqual({ step: "mfa", mfaToken: "t", setupRequired: false, expiresIn: 300 });
    expect(getSession()).toBeNull();
  });

  it("stores the session after a valid code or recovery code", async () => {
    fetchMock.mockImplementation(async () => reply({ data: tokens }));
    await verifyLoginCode("t", { code: "123456" });
    expect(lastCall()).toEqual({ path: "/auth/2fa/verify", body: { mfa_token: "t", code: "123456" } });
    expect(getSession()?.twoFactor).toBe(true);

    await verifyLoginCode("t", { recoveryCode: "ABCD-EFGH" });
    expect(lastCall().body).toEqual({ mfa_token: "t", recovery_code: "ABCD-EFGH" });
  });

  it("shows the backend message when the login step expired", async () => {
    fetchMock.mockResolvedValueOnce(reply({ detail: "Sessão de login expirada. Entre com e-mail e senha de novo." }, 401));
    await expect(verifyLoginCode("t", { code: "123456" })).rejects.toMatchObject({
      status: 401,
      message: "Sessão de login expirada. Entre com e-mail e senha de novo.",
    });
  });

  it("returns the recovery codes on activation and only stores the session later", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: { ...tokens, recovery_codes: ["AAAA-BBBB", "CCCC-DDDD"] } }));
    const result = await activateAuthenticator("t", "123456");
    expect(result.recoveryCodes).toEqual(["AAAA-BBBB", "CCCC-DDDD"]);
    expect(result.session.twoFactor).toBe(true);
    expect(getSession()).toBeNull();
  });

  it("regenerates recovery codes with the current code", async () => {
    setSession({ ...tokens, twoFactor: true });
    fetchMock.mockResolvedValueOnce(reply({ data: { recovery_codes: ["EEEE-FFFF"] } }));
    expect(await regenerateRecoveryCodes("654321")).toEqual(["EEEE-FFFF"]);
    expect(lastCall()).toEqual({ path: "/auth/2fa/recovery-codes", body: { code: "654321" } });
  });

  it("revokes the refresh token on logout and leaves even if the network fails", async () => {
    setSession({ ...tokens, twoFactor: true });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    logout();
    expect(getSession()).toBeNull();
    expect(lastCall()).toEqual({ path: "/auth/logout", body: { refresh: "r" } });
  });
});
