import { getAllPages, getData, patchData, postData } from "./http";
import type {
  ApiCreatedUser,
  ApiInviteResult,
  ApiLocation,
  ApiManagedUser,
  ApiVehicle,
} from "./backend-types";

// User management (platform only) and the password screens. Thin wrappers: the backend enforces every rule.

export type AssignableRole = "seller" | "buyer" | "driver" | "admin";

export function listUsers(): Promise<ApiManagedUser[]> {
  return getData<ApiManagedUser[]>("/auth/users");
}

export function createUser(input: { email: string; name: string; role: AssignableRole }): Promise<ApiCreatedUser> {
  return postData<ApiCreatedUser>("/auth/users", input);
}

export function updateUser(
  id: number,
  changes: { name?: string; role?: AssignableRole; is_active?: boolean }
): Promise<ApiManagedUser> {
  return patchData<ApiManagedUser>(`/auth/users/${id}`, changes);
}

export function resendInvite(id: number): Promise<ApiInviteResult> {
  return postData<ApiInviteResult>(`/auth/users/${id}/invite`);
}

export async function resetTwoFactor(id: number): Promise<string> {
  const reply = await postData<{ detail?: string }>(`/auth/users/${id}/reset-2fa`);
  return reply?.detail ?? "2FA removido. No próximo login a pessoa configura o autenticador de novo.";
}

/** Always answers the same message, whether or not the e-mail exists. */
export async function requestPasswordReset(email: string): Promise<string> {
  const reply = await postData<{ detail?: string }>("/auth/password-reset", { email });
  return reply?.detail ?? "Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.";
}

export function confirmPasswordReset(uid: string, token: string, password: string): Promise<unknown> {
  return postData("/auth/password-reset/confirm", { uid, token, password });
}

// Locations and vehicles: each user sees their own, the shared ones (owner null) and those of their trips.

export type LocationInput = Pick<ApiLocation, "name" | "type" | "address" | "is_active">;
export type VehicleInput = Pick<ApiVehicle, "plate" | "model" | "is_active">;

export const listLocations = () => getAllPages<ApiLocation>("/locations?page_size=500");
export const listVehicles = () => getAllPages<ApiVehicle>("/vehicles?page_size=500");
export const createLocation = (input: LocationInput) => postData<ApiLocation>("/locations", input);
export const updateLocation = (id: number, input: LocationInput) => patchData<ApiLocation>(`/locations/${id}`, input);
export const createVehicle = (input: VehicleInput) => postData<ApiVehicle>("/vehicles", input);
export const updateVehicle = (id: number, input: VehicleInput) => patchData<ApiVehicle>(`/vehicles/${id}`, input);
