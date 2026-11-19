import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, Plus, Truck } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, FormError, Input, Select, Skeleton } from "@/components/ui";
import { useDataService } from "@/hooks/use-data-service";
import { useSession } from "@/hooks/use-session";
import {
  createLocation,
  createVehicle,
  listLocations,
  listVehicles,
  updateLocation,
  updateVehicle,
  type LocationInput,
  type VehicleInput,
} from "@/services/api/admin-api";
import type { ApiLocation, ApiVehicle } from "@/services/api/backend-types";

const locationTypes = [
  { value: "farm", label: "Fazenda" },
  { value: "warehouse", label: "Armazém" },
  { value: "distribution_center", label: "Centro de distribuição" },
];
const typeLabel = Object.fromEntries(locationTypes.map((t) => [t.value, t.label]));

/** The backend lets only the owner (or the platform) change a registration; shared ones have no owner. */
function useCanEdit() {
  const session = useSession();
  return (owner: number | null | undefined) =>
    session?.user.role === "admin" || (owner != null && owner === session?.user.id);
}

function OwnerBadge({ owner }: { owner: number | null | undefined }) {
  const me = useSession()?.user.id;
  if (owner == null) return <Badge variant="neutral">Compartilhado</Badge>;
  if (owner === me) return <Badge variant="success">Seu</Badge>;
  return <Badge variant="muted">De outro usuário</Badge>;
}

function useSaved(key: string) {
  const queryClient = useQueryClient();
  const service = useDataService();
  return () => {
    queryClient.invalidateQueries({ queryKey: [key] });
    // The trip form and trip cards read these through the shared cache.
    service.invalidateLookups();
    queryClient.invalidateQueries({ queryKey: ["trip-form-options"] });
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
  };
}

function LocationDialog({ location, onClose }: { location?: ApiLocation; onClose: () => void }) {
  const saved = useSaved("locations");
  const [form, setForm] = useState<LocationInput>({
    name: location?.name ?? "",
    type: location?.type ?? "farm",
    address: location?.address ?? "",
    is_active: location?.is_active ?? true,
  });
  const save = useMutation({
    mutationFn: () => {
      const input = { ...form, name: form.name.trim(), address: form.address.trim() };
      return location ? updateLocation(location.id, input) : createLocation(input);
    },
    onSuccess: () => {
      saved();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim()) save.mutate();
  }

  return (
    <Dialog title={location ? "Editar local" : "Novo local"} onClose={onClose} busy={save.isPending}>
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <Input id="loc-name" label="Nome" placeholder="Ex.: Fazenda Boa Vista" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <Select id="loc-type" label="Tipo" options={locationTypes} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ApiLocation["type"] })} />
        <Input
          id="loc-address"
          label="Cidade"
          placeholder="Ex.: Petrolina - PE"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <p className="-mt-1 text-xs text-[#5B7264]">No formato "Cidade - UF": o mapa usa para traçar a rota.</p>
        <label className="flex items-center gap-2 text-sm text-[#123A24]">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 accent-[#1A7A44]" />
          Disponível para novas viagens
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending || !form.name.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function VehicleDialog({ vehicle, onClose }: { vehicle?: ApiVehicle; onClose: () => void }) {
  const saved = useSaved("vehicles");
  const [form, setForm] = useState<VehicleInput>({
    plate: vehicle?.plate ?? "",
    model: vehicle?.model ?? "",
    is_active: vehicle?.is_active ?? true,
  });
  const save = useMutation({
    mutationFn: () => {
      const input = { ...form, plate: form.plate.trim().toUpperCase(), model: form.model.trim() };
      return vehicle ? updateVehicle(vehicle.id, input) : createVehicle(input);
    },
    onSuccess: () => {
      saved();
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.plate.trim()) save.mutate();
  }

  return (
    <Dialog title={vehicle ? "Editar veículo" : "Novo veículo"} onClose={onClose} busy={save.isPending}>
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <Input id="veh-plate" label="Placa" placeholder="Ex.: QWE1A23" maxLength={10} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} autoFocus />
        <Input id="veh-model" label="Modelo" placeholder="Ex.: Baú refrigerado" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-[#123A24]">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 accent-[#1A7A44]" />
          Disponível para novas viagens
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending || !form.plate.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Row({
  title,
  detail,
  owner,
  active,
  onEdit,
}: {
  title: string;
  detail: string;
  owner: number | null | undefined;
  active: boolean;
  onEdit?: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#123A24]">{title}</p>
        <p className="truncate text-xs text-[#5B7264]">{detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!active && <Badge variant="muted">Inativo</Badge>}
        <OwnerBadge owner={owner} />
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#1A7A44] hover:bg-[#E6F4EA]"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
      </div>
    </li>
  );
}

export function RegistrationsTab() {
  const canEdit = useCanEdit();
  const locations = useQuery({ queryKey: ["locations"], queryFn: listLocations });
  const vehicles = useQuery({ queryKey: ["vehicles"], queryFn: listVehicles });
  const [editing, setEditing] = useState<
    { kind: "location"; item?: ApiLocation } | { kind: "vehicle"; item?: ApiVehicle } | null
  >(null);

  const loading = (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#5B7264]">
        Locais e veículos usados nas viagens. Você vê os seus, os compartilhados pela plataforma e os das viagens de que
        participa, e só pode editar os que você cadastrou.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#1F8A4D]" /> Locais
            </CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "location" })}>
              <Plus className="h-3.5 w-3.5" /> Novo local
            </Button>
          </CardHeader>
          <CardContent>
            {locations.isLoading ? (
              loading
            ) : locations.error ? (
              <FormError>{locations.error.message}</FormError>
            ) : locations.data?.length ? (
              <ul className="divide-y divide-[#E6F4EA]">
                {locations.data.map((l) => (
                  <Row
                    key={l.id}
                    title={l.name}
                    detail={[typeLabel[l.type] ?? l.type, l.address].filter(Boolean).join(" · ")}
                    owner={l.owner}
                    active={l.is_active}
                    onEdit={canEdit(l.owner) ? () => setEditing({ kind: "location", item: l }) : undefined}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#5B7264]">Nenhum local ainda.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-[#1F8A4D]" /> Veículos
            </CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "vehicle" })}>
              <Plus className="h-3.5 w-3.5" /> Novo veículo
            </Button>
          </CardHeader>
          <CardContent>
            {vehicles.isLoading ? (
              loading
            ) : vehicles.error ? (
              <FormError>{vehicles.error.message}</FormError>
            ) : vehicles.data?.length ? (
              <ul className="divide-y divide-[#E6F4EA]">
                {vehicles.data.map((v) => (
                  <Row
                    key={v.id}
                    title={v.plate}
                    detail={v.model || "—"}
                    owner={v.owner}
                    active={v.is_active}
                    onEdit={canEdit(v.owner) ? () => setEditing({ kind: "vehicle", item: v }) : undefined}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#5B7264]">Nenhum veículo ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {editing?.kind === "location" && <LocationDialog location={editing.item} onClose={() => setEditing(null)} />}
      {editing?.kind === "vehicle" && <VehicleDialog vehicle={editing.item} onClose={() => setEditing(null)} />}
    </div>
  );
}
