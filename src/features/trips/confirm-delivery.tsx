import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useConfirmDelivery } from "@/hooks/use-data-service";
import type { DeliveryCondition, Shipment } from "@/types";

// Same limits the backend enforces in /shipments/{id}/confirm.
const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_NOTES = 10_000;
const PHOTO_TYPES = ["image/jpeg", "image/png"];

const conditions: { value: DeliveryCondition; label: string; hint: string; tone: string }[] = [
  { value: "good", label: "Chegou bem", hint: "Sem avarias", tone: "border-[#1F8A4D] bg-[#E6F4EA] text-[#1A7A44]" },
  { value: "damaged", label: "Com avaria", hint: "Parte da carga danificada", tone: "border-[#E08A2E] bg-[#FEF3E6] text-[#9A5B12]" },
  { value: "critical", label: "Avaria grave", hint: "Carga comprometida", tone: "border-[#D94F4F] bg-[#FCE8E6] text-[#B03A3A]" },
];

function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return `"${file.name}" não é JPEG nem PNG.`;
  if (file.size > MAX_PHOTO_BYTES) return `"${file.name}" tem mais de 5 MB.`;
  return null;
}

export function ConfirmDeliveryDialog({
  shipment,
  onClose,
  onDone,
}: {
  shipment: Shipment;
  onClose: () => void;
  onDone?: () => void;
}) {
  const confirm = useConfirmDelivery();
  const [condition, setCondition] = useState<DeliveryCondition | null>(null);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const needsPhotos = condition !== null && condition !== "good";
  const missing = !condition
    ? "Escolha como a carga chegou."
    : needsPhotos && photos.length === 0
      ? "Com avaria, envie ao menos uma foto como prova."
      : null;

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const picked = [...files];
    const problem = picked.map(photoProblem).find(Boolean);
    const valid = picked.filter((f) => !photoProblem(f));
    const next = [...photos, ...valid].slice(0, MAX_PHOTOS);
    setPhotos(next);
    setPhotoError(
      problem ?? (photos.length + valid.length > MAX_PHOTOS ? `Envie no máximo ${MAX_PHOTOS} fotos.` : null)
    );
  }

  async function submit() {
    if (!condition || missing) return;
    try {
      await confirm.mutateAsync({ id: shipment.id, confirmation: { condition, notes, photos } });
      onDone?.();
      onClose();
    } catch {
      // The message is shown from confirm.error.
    }
  }

  const busy = confirm.isPending;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delivery-title"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="confirm-delivery-title" className="text-lg font-bold text-[#123A24]">
              Confirmar recebimento de {shipment.id}
            </h2>
            <p className="mt-1 text-sm text-[#5B7264]">
              {shipment.fruitName} · {shipment.origin} → {shipment.destination}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1 text-[#5B7264] hover:bg-[#F4FAF5]" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-[#123A24]">Como a carga chegou?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {conditions.map((c) => (
              <label
                key={c.value}
                className={cn(
                  "cursor-pointer rounded-xl border-2 px-3 py-2 text-sm transition-colors",
                  condition === c.value ? c.tone : "border-[#E6F4EA] text-[#123A24] hover:bg-[#F4FAF5]"
                )}
              >
                <input
                  type="radio"
                  name="condition"
                  value={c.value}
                  checked={condition === c.value}
                  onChange={() => setCondition(c.value)}
                  className="sr-only"
                />
                <span className="block font-semibold">{c.label}</span>
                <span className="block text-xs opacity-80">{c.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <label htmlFor="delivery-notes" className="text-sm font-medium text-[#123A24]">
              Observações <span className="font-normal text-[#5B7264]">(opcional)</span>
            </label>
            <span className="text-xs text-[#5B7264]">
              {notes.length.toLocaleString("pt-BR")}/{MAX_NOTES.toLocaleString("pt-BR")}
            </span>
          </div>
          <textarea
            id="delivery-notes"
            value={notes}
            maxLength={MAX_NOTES}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Ex.: 3 caixas amassadas no fundo do baú."
            className="mt-1.5 w-full rounded-lg border border-[#BFE3C8]/50 px-3 py-2 text-sm text-[#123A24] placeholder:text-[#5B7264] focus:border-[#1F8A4D] focus:outline-none focus:ring-2 focus:ring-[#1F8A4D]/20"
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-[#123A24]">
            Fotos {needsPhotos ? <span className="text-[#B03A3A]">(obrigatório com avaria)</span> : <span className="font-normal text-[#5B7264]">(opcional)</span>}
          </p>
          <p className="text-xs text-[#5B7264]">JPEG ou PNG, até 5 MB cada, no máximo {MAX_PHOTOS}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {previews.map((url, i) => (
              <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-[#E6F4EA]">
                <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                  aria-label={`Remover foto ${i + 1}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#BFE3C8] text-xs text-[#1A7A44] hover:bg-[#F4FAF5]">
                <Camera className="h-5 w-5" />
                Adicionar
                <input
                  type="file"
                  accept={PHOTO_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {photoError && <p className="mt-2 text-xs text-[#B03A3A]">{photoError}</p>}
        </div>

        {confirm.error && (
          <p className="mt-4 rounded-lg bg-[#FCE8E6] px-3 py-2 text-sm text-[#B03A3A]" role="alert">
            {confirm.error.message}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {missing && condition && <p className="text-xs text-[#9A5B12] sm:mr-auto">{missing}</p>}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || !!missing}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {busy && photos.length > 0 ? "Enviando fotos…" : "Confirmar recebimento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
