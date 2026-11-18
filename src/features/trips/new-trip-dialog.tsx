import { useState, type FormEvent } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { useCreateShipment, usePeople, useTripFormOptions } from "@/hooks/use-data-service";
import type { TripOption } from "@/types";

const toOptions = (items: TripOption[] = []) =>
  items.map((o) => ({ value: String(o.id), label: o.detail ? `${o.label} · ${o.detail}` : o.label }));

/** "2026-11-17T14:30" in local time, the format of <input type="datetime-local">. */
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function PersonField({
  role,
  label,
  value,
  onChange,
}: {
  role: "buyer" | "driver";
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: people, isLoading } = usePeople(role);
  if (isLoading) return <Select id={`trip-${role}`} label={label} options={[]} placeholder="Carregando…" value="" disabled />;
  // The backend has no user list yet (the backend team will add it); until then, the id is typed.
  if (people === null || people === undefined) {
    return (
      <Input
        id={`trip-${role}`}
        label={`${label} (id do usuário)`}
        inputMode="numeric"
        placeholder="Ex.: 5"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    );
  }
  return (
    <Select
      id={`trip-${role}`}
      label={label}
      options={[{ value: "", label: "Sem definir" }, ...toOptions(people)]}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NewTripDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data: options, isLoading, error: loadError } = useTripFormOptions();
  const create = useCreateShipment();
  const [form, setForm] = useState({
    origin: "",
    destination: "",
    vehicle: "",
    device: "",
    buyer: "",
    driver: "",
    startsAt: localNow(),
    fruit: "",
    lot: "",
    quantityKg: "",
  });
  const set = (field: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const quantity = Number(form.quantityKg.replace(",", "."));
  const problem =
    form.origin && form.origin === form.destination
      ? "Origem e destino devem ser diferentes."
      : form.quantityKg && !(quantity > 0)
        ? "A quantidade deve ser maior que zero."
        : null;
  const complete =
    form.origin && form.destination && form.vehicle && form.device && form.startsAt && form.fruit && form.lot.trim() && quantity > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!complete || problem) return;
    try {
      const id = await create.mutateAsync({
        origin: Number(form.origin),
        destination: Number(form.destination),
        vehicle: Number(form.vehicle),
        device: Number(form.device),
        buyer: form.buyer ? Number(form.buyer) : undefined,
        driver: form.driver ? Number(form.driver) : undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        items: [{ fruit: Number(form.fruit), lot: form.lot.trim(), quantityKg: quantity }],
      });
      onCreated(id);
    } catch {
      // Shown from create.error.
    }
  }

  const busy = create.isPending;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-trip-title"
      onClick={() => !busy && onClose()}
    >
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        noValidate
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="new-trip-title" className="text-lg font-bold text-[#123A24]">
              Nova viagem
            </h2>
            <p className="mt-1 text-sm text-[#5B7264]">A viagem fica em Planejadas até o motorista ou o vendedor iniciar.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1 text-[#5B7264] hover:bg-[#F4FAF5]" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-[#5B7264]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando locais, caminhões e placas…
          </p>
        ) : loadError ? (
          <p className="mt-4 rounded-lg bg-[#FCE8E6] px-3 py-2 text-sm text-[#B03A3A]" role="alert">
            {loadError.message}
          </p>
        ) : (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#1A7A44]">Rota</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Select id="trip-origin" label="Origem" placeholder="Escolha" options={toOptions(options?.locations)} value={form.origin} onChange={(e) => set("origin")(e.target.value)} />
              <Select id="trip-destination" label="Destino" placeholder="Escolha" options={toOptions(options?.locations)} value={form.destination} onChange={(e) => set("destination")(e.target.value)} />
              <Input id="trip-starts" label="Início previsto" type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt")(e.target.value)} />
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#1A7A44]">Transporte</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Select id="trip-vehicle" label="Caminhão" placeholder="Escolha" options={toOptions(options?.vehicles)} value={form.vehicle} onChange={(e) => set("vehicle")(e.target.value)} />
              <Select id="trip-device" label="Placa de monitoramento" placeholder={options?.devices.length ? "Escolha" : "Nenhuma placa sua"} options={toOptions(options?.devices)} value={form.device} onChange={(e) => set("device")(e.target.value)} />
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#1A7A44]">Pessoas</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <PersonField role="driver" label="Motorista" value={form.driver} onChange={set("driver")} />
              <PersonField role="buyer" label="Comprador" value={form.buyer} onChange={set("buyer")} />
            </div>
            <p className="mt-1.5 text-xs text-[#5B7264]">
              O motorista inicia e finaliza a viagem pelo celular; o comprador confirma o recebimento.
            </p>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#1A7A44]">Carga</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Select id="trip-fruit" label="Fruta" placeholder="Escolha" options={toOptions(options?.fruits)} value={form.fruit} onChange={(e) => set("fruit")(e.target.value)} />
              <Input id="trip-lot" label="Lote" placeholder="Ex.: MG-1711-01" value={form.lot} onChange={(e) => set("lot")(e.target.value)} />
              <Input id="trip-kg" label="Quantidade (kg)" inputMode="decimal" placeholder="Ex.: 4500" value={form.quantityKg} onChange={(e) => set("quantityKg")(e.target.value)} />
            </div>
          </>
        )}

        {(problem || create.error) && (
          <p className="mt-4 rounded-lg bg-[#FCE8E6] px-3 py-2 text-sm text-[#B03A3A]" role="alert">
            {problem ?? create.error?.message}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !complete || !!problem}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar viagem
          </Button>
        </div>
      </form>
    </div>
  );
}
