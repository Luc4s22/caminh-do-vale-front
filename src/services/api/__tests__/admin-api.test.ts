import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmPasswordReset,
  createUser,
  listUsers,
  requestPasswordReset,
  resendInvite,
  resetTwoFactor,
  updateLocation,
  updateUser,
} from "../admin-api";
import { setSession } from "../session";

let fetchMock: ReturnType<typeof vi.fn>;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const call = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i];
  return {
    path: new URL(url as string).pathname.replace("/api/v1", ""),
    method: (init as RequestInit).method ?? "GET",
    body: (init as RequestInit).body ? JSON.parse(String((init as RequestInit).body)) : undefined,
  };
};

beforeEach(() => {
  setSession({ access: "a", refresh: "r", user: { id: 1, name: "Admin", email: "admin@example.com", role: "admin" } });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
});

describe("user management", () => {
  it("lists every user without the role filter", async () => {
    const user = { id: 3, name: "Ana", email: "ana@example.com", role: "buyer", is_active: true, has_password: false, has_2fa: false, last_login: null, date_joined: "2026-11-19T10:00:00Z" };
    fetchMock.mockResolvedValueOnce(reply({ data: [user] }));
    expect(await listUsers()).toEqual([user]);
    expect(call()).toMatchObject({ path: "/auth/users", method: "GET" });
  });

  it("creates a user and returns the invite link when the e-mail did not go out", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ data: { user: { id: 4, name: "Bia" }, invite_sent: false, password_setup_link: "https://front/redefinir-senha?uid=NA&token=t" } }, 201)
    );
    const result = await createUser({ email: "bia@example.com", name: "Bia", role: "driver" });
    expect(result.password_setup_link).toContain("uid=");
    expect(call()).toEqual({ path: "/auth/users", method: "POST", body: { email: "bia@example.com", name: "Bia", role: "driver" } });
  });

  it("shows the backend message for a repeated e-mail", async () => {
    fetchMock.mockResolvedValueOnce(reply({ email: ["Já existe um usuário com este e-mail."] }, 400));
    await expect(createUser({ email: "a@example.com", name: "A", role: "seller" })).rejects.toThrow("Já existe um usuário com este e-mail.");
  });

  it("edits, resends the invite and resets 2FA on the user's routes", async () => {
    fetchMock.mockImplementation(async () => reply({ data: { invite_sent: true, password_setup_link: null, detail: "2FA removido." } }));
    await updateUser(7, { is_active: false });
    await resendInvite(7);
    await resetTwoFactor(7);
    expect(call(0)).toEqual({ path: "/auth/users/7", method: "PATCH", body: { is_active: false } });
    expect(call(1)).toMatchObject({ path: "/auth/users/7/invite", method: "POST" });
    expect(call(2)).toMatchObject({ path: "/auth/users/7/reset-2fa", method: "POST" });
  });
});

describe("password screens", () => {
  it("sends uid, token and the new password", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: { detail: "Senha alterada com sucesso." } }));
    await confirmPasswordReset("NA", "tok", "uma-senha-boa");
    expect(call()).toEqual({ path: "/auth/password-reset/confirm", method: "POST", body: { uid: "NA", token: "tok", password: "uma-senha-boa" } });
  });

  it("shows the first password rule the backend rejected", async () => {
    fetchMock.mockResolvedValueOnce(reply({ password: ["Esta senha é muito comum."] }, 400));
    await expect(confirmPasswordReset("NA", "tok", "12345678")).rejects.toThrow("Esta senha é muito comum.");
  });

  it("returns the generic answer of the forgot-password request", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: { detail: "Se o e-mail estiver cadastrado, você receberá instruções." } }));
    expect(await requestPasswordReset("x@example.com")).toContain("Se o e-mail estiver cadastrado");
  });
});

it("edits a location with PATCH", async () => {
  fetchMock.mockResolvedValueOnce(reply({ data: { id: 2 } }));
  await updateLocation(2, { name: "Fazenda", type: "farm", address: "Petrolina - PE", is_active: true });
  expect(call()).toMatchObject({ path: "/locations/2", method: "PATCH" });
});
