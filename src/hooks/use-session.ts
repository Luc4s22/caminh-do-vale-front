import { useSyncExternalStore } from "react";
import { getSession, setSession, subscribeSession, type Session, type UserRole } from "@/services/api/session";
import { postData } from "@/services/api/http";
import type {
  ApiLoginResponse,
  ApiMfaActivation,
  ApiMfaSetup,
  ApiTokens,
} from "@/services/api/backend-types";

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, getSession);
}

function useRole(): UserRole | null {
  return useSession()?.user.role ?? null;
}

const has = (role: UserRole | null, allowed: UserRole[]) => role !== null && allowed.includes(role);

// The backend enforces every rule below; these only decide which menus and buttons to show.

/** Opens the Viagens page: everyone who takes part in trips. */
export function useCanSeeTrips(): boolean {
  return has(useRole(), ["admin", "operator", "seller", "driver", "buyer"]);
}

/** Confirm receipt of a delivered trip (the buyer of that trip; the backend checks). */
export function useCanConfirmDelivery(): boolean {
  return has(useRole(), ["admin", "buyer"]);
}

export function useIsDriver(): boolean {
  return useRole() === "driver";
}

/** Who a menu item is for; items without `only` are for everyone. */
export type NavAudience = "trips" | "driver" | "notDriver";

export function useNavFilter(): (item: { only?: NavAudience }) => boolean {
  const role = useRole();
  const allowed: Record<NavAudience, boolean> = {
    trips: has(role, ["admin", "operator", "seller", "driver", "buyer"]),
    driver: role === "driver",
    notDriver: role !== "driver",
  };
  return (item) => !item.only || allowed[item.only];
}

/** Start and finish trips (the driver only their own; the backend checks). */
export function useCanRunTrips(): boolean {
  return has(useRole(), ["admin", "operator", "seller", "driver"]);
}

/** Create trips and plan new ones from a finished trip. */
export function useCanPlanTrips(): boolean {
  return has(useRole(), ["admin", "operator", "seller"]);
}

/** Acknowledge and resolve alerts of trips the user takes part in. */
export function useCanHandleAlerts(): boolean {
  return has(useRole(), ["admin", "operator", "seller", "driver"]);
}

export type LoginResult =
  | { step: "done" }
  | { step: "mfa"; mfaToken: string; setupRequired: boolean; expiresIn: number };

function toSession(data: ApiTokens, twoFactor: boolean): Session {
  return { access: data.access, refresh: data.refresh, user: data.user, twoFactor };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const data = await postData<ApiLoginResponse>("/auth/login", { email, password });
  if ("mfa_required" in data && data.mfa_required) {
    return { step: "mfa", mfaToken: data.mfa_token, setupRequired: data.mfa_setup_required, expiresIn: data.expires_in };
  }
  setSession(toSession(data as ApiTokens, false));
  return { step: "done" };
}

export function startAuthenticatorSetup(mfaToken: string): Promise<ApiMfaSetup> {
  return postData<ApiMfaSetup>("/auth/2fa/setup", { mfa_token: mfaToken });
}

/** Confirms the authenticator. The session is returned, not stored, so the recovery codes can be shown first. */
export async function activateAuthenticator(
  mfaToken: string,
  code: string
): Promise<{ session: Session; recoveryCodes: string[] }> {
  const data = await postData<ApiMfaActivation>("/auth/2fa/activate", { mfa_token: mfaToken, code });
  return { session: toSession(data, true), recoveryCodes: data.recovery_codes };
}

export async function verifyLoginCode(
  mfaToken: string,
  input: { code: string } | { recoveryCode: string }
): Promise<void> {
  const body = "code" in input ? { mfa_token: mfaToken, code: input.code } : { mfa_token: mfaToken, recovery_code: input.recoveryCode };
  const data = await postData<ApiTokens>("/auth/2fa/verify", body);
  setSession(toSession(data, true));
}

export async function regenerateRecoveryCodes(code: string): Promise<string[]> {
  const data = await postData<{ recovery_codes: string[] }>("/auth/2fa/recovery-codes", { code });
  return data.recovery_codes;
}

export function finishLogin(session: Session): void {
  setSession(session);
}

export function logout(): void {
  const refresh = getSession()?.refresh;
  // Revoke the refresh token on the server; leaving locally must not wait for (or fail with) the network.
  if (refresh) postData("/auth/logout", { refresh }).catch(() => {});
  setSession(null);
}
