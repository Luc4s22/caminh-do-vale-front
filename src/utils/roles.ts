import type { UserRole } from "@/services/api/session";

export const roleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  seller: "Vendedor",
  buyer: "Comprador",
  driver: "Motorista",
  operator: "Operador",
  viewer: "Visualizador",
};
