import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Droplets, Flag, Loader2, MapPin, Package, Play, Thermometer, Truck } from "lucide-react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useFinishShipment, useMyTrips, useStartShipment } from "@/hooks/use-data-service";
import { useIsDriver } from "@/hooks/use-session";
import { formatDateTime, formatEnvironmentalStatus, formatHumidity, formatRelativeTime, formatTemperature } from "@/utils/format";
import { DeviceStatus } from "@/features/shipments/components/device-status";
import type { Shipment } from "@/types";

const order: Record<string, number> = { in_transit: 0, pending: 1, awaiting_confirmation: 2 };

function Reading({
  icon: Icon,
  label,
  value,
  range,
  outside,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  range: string;
  outside: boolean;
}) {
  return (
    <div className={cn("rounded-xl p-4", outside ? "bg-[#FCE8E6]" : "bg-[#F4FAF5]")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-[#5B7264]">
        <Icon className="h-4 w-4" />
        {label}
      </p>
      <p className={cn("mt-1 text-3xl font-bold", outside ? "text-[#B03A3A]" : "text-[#123A24]")}>{value}</p>
      <p className="text-xs text-[#5B7264]">Ideal: {range}</p>
    </div>
  );
}

function TripCard({ shipment }: { shipment: Shipment }) {
  const start = useStartShipment();
  const finish = useFinishShipment();
  const [confirming, setConfirming] = useState(false);
  const action = shipment.logisticsStatus === "pending" ? start : shipment.logisticsStatus === "in_transit" ? finish : null;
  const reading = shipment.latestReading;
  const limits = shipment.environmentalLimits;
  const tempOutside =
    reading?.temperatureC != null && (reading.temperatureC < limits.temperatureMinC || reading.temperatureC > limits.temperatureMaxC);
  const humidityOutside =
    reading?.relativeHumidity != null &&
    (reading.relativeHumidity < limits.relativeHumidityMin || reading.relativeHumidity > limits.relativeHumidityMax);

  async function run() {
    if (!action) return;
    try {
      await action.mutateAsync(shipment.id);
      setConfirming(false);
    } catch {
      // Shown from action.error.
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[#5B7264]">{shipment.id}</p>
          <h2 className="text-xl font-bold text-[#123A24]">{shipment.fruitName}</h2>
        </div>
        {shipment.logisticsStatus === "in_transit" && <Badge variant="info">Em andamento</Badge>}
        {shipment.logisticsStatus === "pending" && <Badge variant="neutral">Planejada</Badge>}
        {shipment.logisticsStatus === "awaiting_confirmation" && <Badge variant="warning">Aguardando confirmação</Badge>}
      </div>

      <div className="space-y-1.5 text-sm text-[#123A24]">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1A7A44]" />
          <span>
            {shipment.origin} <ArrowRight className="inline h-3.5 w-3.5 text-[#5B7264]" /> {shipment.destination}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#5B7264]">
          <span className="flex items-center gap-1.5">
            <Package className="h-4 w-4" /> Lote {shipment.batchId}
          </span>
          {shipment.vehicleId && (
            <span className="flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> {shipment.vehicleId}
            </span>
          )}
          {shipment.startedAt && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Início {formatDateTime(shipment.startedAt)}
            </span>
          )}
        </p>
        <DeviceStatus device={shipment.device} />
      </div>

      {shipment.logisticsStatus === "in_transit" && (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Reading
              icon={Thermometer}
              label="Temperatura"
              value={formatTemperature(reading?.temperatureC ?? null)}
              range={`${limits.temperatureMinC}–${limits.temperatureMaxC} °C`}
              outside={tempOutside}
            />
            <Reading
              icon={Droplets}
              label="Umidade"
              value={formatHumidity(reading?.relativeHumidity ?? null)}
              range={`${limits.relativeHumidityMin}–${limits.relativeHumidityMax}%`}
              outside={humidityOutside}
            />
          </div>
          <p className="mt-2 text-xs text-[#5B7264]">
            {reading
              ? `${formatEnvironmentalStatus(shipment.environmentalStatus)} · última leitura ${formatRelativeTime(reading.measuredAt)} · atualiza a cada 10 s`
              : "Ainda sem leituras da placa."}
          </p>
        </div>
      )}

      {shipment.logisticsStatus === "awaiting_confirmation" && (
        <p className="rounded-xl bg-[#FEF3E6] px-4 py-3 text-sm text-[#9A5B12]">
          Entrega registrada. Agora o comprador confere a carga e confirma o recebimento. Você não precisa fazer mais nada.
        </p>
      )}

      {action?.error && (
        <p className="rounded-lg bg-[#FCE8E6] px-3 py-2 text-sm text-[#B03A3A]" role="alert">
          {action.error.message}
        </p>
      )}

      {action &&
        (confirming ? (
          <div className="space-y-2 rounded-xl border border-[#E6F4EA] p-3">
            <p className="text-sm text-[#123A24]">
              {shipment.logisticsStatus === "pending"
                ? "Iniciar agora? As leituras da placa passam a contar para esta viagem."
                : "Chegou ao destino? A viagem será encerrada e o comprador poderá confirmar o recebimento."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" size="lg" onClick={() => setConfirming(false)} disabled={action.isPending}>
                Voltar
              </Button>
              <Button size="lg" variant={shipment.logisticsStatus === "in_transit" ? "danger" : "primary"} onClick={run} disabled={action.isPending}>
                {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </div>
        ) : shipment.logisticsStatus === "pending" ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={() => setConfirming(true)}>
            <Play className="h-5 w-5" />
            Iniciar viagem
          </Button>
        ) : (
          <Button size="lg" variant="danger" className="h-14 w-full text-base" onClick={() => setConfirming(true)}>
            <Flag className="h-5 w-5" />
            Finalizar viagem
          </Button>
        ))}

      <Link to={`/cargas/${shipment.id}`} className="block text-center text-sm font-medium text-[#1A7A44] hover:underline">
        Ver gráficos e alertas da carga
      </Link>
    </Card>
  );
}

export default function MyTripPage() {
  const isDriver = useIsDriver();
  const { data: trips, isLoading, error } = useMyTrips();

  if (!isDriver) {
    return (
      <EmptyState
        icon={Truck}
        title="Tela do motorista"
        description="Aqui o motorista vê a viagem que está conduzindo. Para acompanhar todas as viagens, use Viagens."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <EmptyState icon={Truck} title="Não foi possível carregar sua viagem" description={error.message} />;
  }

  const sorted = [...(trips ?? [])].sort((a, b) => (order[a.logisticsStatus] ?? 9) - (order[b.logisticsStatus] ?? 9));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#123A24]">Minha viagem</h1>
        <p className="mt-1 text-sm text-[#5B7264]">Inicie quando sair e finalize quando chegar ao destino.</p>
      </div>
      {sorted.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhuma viagem para você agora"
          description="Quando o vendedor colocar você como motorista de uma viagem, ela aparece aqui."
        />
      ) : (
        sorted.map((s) => <TripCard key={s.id} shipment={s} />)
      )}
    </div>
  );
}
