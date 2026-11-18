import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiDataProvider } from "../api-provider";
import { getSession, setSession } from "../session";

const BASE = "https://projeto-integrador-time1.onrender.com/api/v1";

const page = <T,>(data: T[]) => ({ data, pagination: { next: null, previous: null, count: data.length } });

const shipment = {
  id: 2,
  origin: 2,
  destination: 4,
  vehicle: 1,
  device: 2,
  created_by: 2,
  status: "active",
  started_at: "2026-11-02T10:00:00Z",
  ended_at: null,
  items: [{ id: 2, shipment: 2, fruit: 1, fruit_name: "Manga", lot: "MG-2810-07", quantity_kg: "4500.00" }],
  created_at: "2026-11-02T10:00:00Z",
};

const summary = {
  shipment_id: 2,
  status: "active",
  fruits: [{ id: 1, name: "Manga" }],
  device: { id: 2, uid: "VSF-002", online: true, connection: "wifi", last_seen_at: "2026-11-02T12:00:00Z" },
  latest_reading: { recorded_at: "2026-11-02T12:00:00Z", temperature_c: 14.3, humidity_pct: 87.5, impact_peak_g: 0.4 },
  limits: {
    temperature_min_c: 10, temperature_max_c: 13, temperature_critical_margin_c: 3,
    humidity_min_pct: 85, humidity_max_pct: 90, humidity_critical_margin_pct: 10, impact_max_g: 2.5,
  },
  limits_warning: null,
  open_alerts: 2,
  current_status: "warning",
};

const alerts = [
  {
    id: 7, shipment: 2, type: "temperature", severity: "warning", status: "open", message: "",
    measured_value: "14.30", violated_limit: "13.00", created_at: "2026-11-02T11:45:00Z",
    acknowledged_by_name: null, acknowledged_at: null, resolved_at: null,
  },
  {
    id: 8, shipment: 2, type: "shock", severity: "critical", status: "acknowledged", message: "Impacto de 3.1 g",
    measured_value: "3.10", violated_limit: "2.50", created_at: "2026-11-02T10:47:00Z",
    acknowledged_by_name: "Operador Demo", acknowledged_at: "2026-11-02T11:00:00Z", resolved_at: null,
  },
  {
    id: 3, shipment: 1, type: "humidity", severity: "warning", status: "resolved", message: "",
    measured_value: "80.00", violated_limit: "85.00", created_at: "2026-11-01T10:00:00Z",
    acknowledged_by_name: null, acknowledged_at: null, resolved_at: "2026-11-01T11:00:00Z",
  },
];

const routes: Record<string, unknown> = {
  "/shipments": page([shipment]),
  "/shipments/2": { data: shipment },
  "/shipments/2/summary": { data: summary },
  "/shipments/2/readings": page([
    { id: 11, shipment: 2, device: 2, sequence: 2, recorded_at: "2026-11-02T12:00:00Z", received_at: "2026-11-02T12:00:01Z", temperature_c: "14.30", humidity_pct: "87.50", impact_peak_g: "0.40", network: "wifi" },
    { id: 10, shipment: 2, device: 2, sequence: 1, recorded_at: "2026-11-02T11:55:00Z", received_at: "2026-11-02T11:55:01Z", temperature_c: "12.10", humidity_pct: "88.00", impact_peak_g: null, network: "wifi" },
  ]),
  "/alerts": page(alerts),
  "/locations": page([
    { id: 2, name: "Packing House Juazeiro", type: "warehouse", address: "Juazeiro - BA", is_active: true },
    { id: 4, name: "CEAGESP", type: "distribution_center", address: "São Paulo - SP", is_active: true },
  ]),
  "/vehicles": page([{ id: 1, plate: "QWE1A23", model: "Baú", is_active: true }]),
  "/devices": page([
    { id: 1, uid: "VSF-001", name: "Placa real", is_active: true, online: false, last_seen_at: null, last_connection_type: "", wifi_ssid: "" },
    { id: 2, uid: "VSF-002", name: "Simulador", is_active: true, online: true, last_seen_at: "2026-11-02T12:00:00Z", last_connection_type: "wifi", wifi_ssid: "x" },
  ]),
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setSession({ access: "old-access", refresh: "refresh", user: { id: 2, name: "Operador Demo", email: "operador@example.com", role: "operator" } });
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const path = url.pathname.replace("/api/v1", "").replace(/\/$/, "");
    if (path.endsWith("/ack")) return new Response(JSON.stringify({ data: {} }), { status: 200 });
    const body = routes[path];
    if (!body) return new Response(JSON.stringify({ detail: "Rota não encontrada." }), { status: 404 });
    void init;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
});

describe("ApiDataProvider", () => {
  it("maps a backend shipment and its summary to the front Shipment", async () => {
    const [s] = await new ApiDataProvider().getShipments();
    expect(s).toMatchObject({
      id: "VG-2",
      batchId: "MG-2810-07",
      fruitName: "Manga",
      quantityKg: 4500,
      vehicleId: "QWE1A23",
      sensorIds: ["VSF-002"],
      origin: "Packing House Juazeiro",
      destination: "CEAGESP",
      logisticsStatus: "in_transit",
      environmentalStatus: "warning",
      environmentalLimits: { temperatureMinC: 10, temperatureMaxC: 13, relativeHumidityMin: 85, relativeHumidityMax: 90 },
    });
    expect(s.latestReading).toMatchObject({ temperatureC: 14.3, relativeHumidity: 87.5 });
  });

  it("sends the bearer token", async () => {
    await new ApiDataProvider().getShipmentById("VG-2");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer old-access");
  });

  it("returns readings oldest first with decimals parsed", async () => {
    const readings = await new ApiDataProvider().getReadingHistory("VG-2", "24h");
    expect(readings.map((r) => r.temperatureC)).toEqual([12.1, 14.3]);
    expect(readings[0].sensorId).toBe("VSF-002");
    expect(fetchMock.mock.calls[0][0]).toContain("start=");
  });

  it("maps alert types, statuses and filters active alerts", async () => {
    const active = await new ApiDataProvider().getAlerts({ status: "active" });
    expect(active.map((a) => [a.id, a.type, a.status, a.shipmentId])).toEqual([
      ["7", "temperature_high", "active", "VG-2"],
      ["8", "shock", "active", "VG-2"],
    ]);
    expect(active[1].acknowledgedAt).toBe("2026-11-02T11:00:00Z");
    const all = await new ApiDataProvider().getAlerts();
    expect(all.find((a) => a.id === "3")).toMatchObject({ type: "humidity_low", status: "resolved" });
  });

  it("builds the dashboard summary", async () => {
    expect(await new ApiDataProvider().getDashboardSummary()).toEqual({
      shipmentsInTransit: 1,
      shipmentsOptimal: 0,
      activeAlerts: 2,
      completedDeliveries: 0,
      sensorsOffline: 1,
    });
  });

  it("shares one backend load across the screens that open together", async () => {
    const provider = new ApiDataProvider();
    await Promise.all([
      provider.getDashboardSummary(),
      provider.getShipments(),
      provider.getAlerts({ status: "active" }),
      provider.getNotifications(),
      provider.getShipmentById("VG-2"),
    ]);
    const paths = fetchMock.mock.calls.map(([url]) => new URL(url as string).pathname.replace("/api/v1", ""));
    const count = (p: string) => paths.filter((x) => x === p).length;
    expect(count("/shipments")).toBe(1);
    expect(count("/shipments/2/summary")).toBe(1);
    expect(count("/alerts")).toBe(1);
    expect(count("/locations")).toBe(1);
  });

  it("reloads alerts after acknowledging one", async () => {
    const provider = new ApiDataProvider();
    await provider.getAlerts();
    await provider.acknowledgeAlert("7");
    await provider.getAlerts();
    const alertLoads = fetchMock.mock.calls.filter(([url]) => new URL(url as string).pathname.endsWith("/alerts"));
    expect(alertLoads).toHaveLength(2);
  });

  it("assigns the fictitious carrier from the vehicle plate", async () => {
    const [s] = await new ApiDataProvider().getShipments();
    expect(s.carrier).toEqual({ id: "transvale", name: "TransVale Frios Logística" });
  });

  it.each([
    ["resolveAlert", "7", "/alerts/7/resolve"],
    ["startShipment", "VG-3", "/shipments/3/start"],
    ["finishShipment", "VG-2", "/shipments/2/finish"],
  ] as const)("%s posts to %s", async (method, id, path) => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await new ApiDataProvider()[method](id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}${path}`);
    expect(init.method).toBe("POST");
  });

  it.each([
    ["delivered", "awaiting_confirmation"],
    ["completed", "delivered"],
  ] as const)("finishing a trip that becomes %s shows it as %s", async (backendStatus, frontStatus) => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: { ...shipment, status: backendStatus } }), { status: 200 }));
    expect(await new ApiDataProvider().finishShipment("VG-2")).toBe(frontStatus);
  });

  it("lists trips awaiting the buyer's confirmation", async () => {
    fetchMock.mockImplementation(async (input: string) => {
      const path = new URL(input).pathname.replace("/api/v1", "").replace(/\/$/, "");
      if (path === "/shipments") return new Response(JSON.stringify(page([{ ...shipment, status: "delivered" }])), { status: 200 });
      return new Response(JSON.stringify(routes[path] ?? { detail: "x" }), { status: routes[path] ? 200 : 404 });
    });
    const [s] = await new ApiDataProvider().getShipments();
    expect(s.logisticsStatus).toBe("awaiting_confirmation");
  });

  it("creates a trip with buyer, driver and cargo in one request", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: { ...shipment, id: 12, status: "planned" } }), { status: 201 }));
    const id = await new ApiDataProvider().createShipment({
      origin: 2, destination: 4, vehicle: 1, device: 2, buyer: 5, driver: 7,
      startsAt: "2026-11-17T12:00:00.000Z",
      items: [{ fruit: 1, lot: "MG-1711-01", quantityKg: 4500 }],
    });
    expect(id).toBe("VG-12");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/shipments`);
    expect(JSON.parse(init.body)).toEqual({
      origin: 2, destination: 4, vehicle: 1, device: 2, buyer: 5, driver: 7,
      started_at: "2026-11-17T12:00:00.000Z",
      items: [{ fruit: 1, lot: "MG-1711-01", quantity_kg: "4500.00" }],
    });
  });

  it("sends the buyer confirmation as multipart with the photos", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: { id: 1, condition: "damaged" } }), { status: 200 }));
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "caixa.jpg", { type: "image/jpeg" });
    await new ApiDataProvider().confirmDelivery("VG-2", { condition: "damaged", notes: " 3 caixas amassadas ", photos: [photo, photo] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/shipments/2/confirm`);
    const form = init.body as FormData;
    expect(form.get("condition")).toBe("damaged");
    expect(form.get("notes")).toBe("3 caixas amassadas");
    expect(form.getAll("photos")).toHaveLength(2);
    // The browser must set the multipart boundary itself.
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("loads the driver's trips from /shipments/current", async () => {
    routes["/shipments/current"] = { data: [{ ...shipment, driver: 7 }] };
    const [trip] = await new ApiDataProvider().getMyTrips();
    delete routes["/shipments/current"];
    expect(trip).toMatchObject({ id: "VG-2", logisticsStatus: "in_transit", driverId: 7 });
  });

  it("has no driver trips on the backend without roles", async () => {
    expect(await new ApiDataProvider().getMyTrips()).toEqual([]);
  });

  it("falls back to typing the id while the backend has no user list", async () => {
    expect(await new ApiDataProvider().getPeople("buyer")).toBeNull();
    routes["/auth/users"] = { data: [{ id: 5, name: "Comprador Demo", email: "comprador@example.com", role: "buyer" }] };
    const people = await new ApiDataProvider().getPeople("buyer");
    delete routes["/auth/users"];
    expect(people).toEqual([{ id: 5, label: "Comprador Demo", detail: "comprador@example.com" }]);
  });

  it("treats a trip the user cannot see (404) as not found", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ detail: "Não encontrado." }), { status: 404 }));
    expect(await new ApiDataProvider().getShipmentById("VG-99")).toBeNull();
  });

  it("repeats a trip as a new planned shipment with the same route, vehicle, board and cargo", async () => {
    const posted: { path: string; body: unknown }[] = [];
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname.replace("/api/v1", "");
      if (init?.method === "POST") {
        posted.push({ path, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ data: path === "/shipments" ? { ...shipment, id: 9, status: "planned" } : {} }), { status: 201 });
      }
      return new Response(JSON.stringify(routes[path]), { status: 200 });
    });

    expect(await new ApiDataProvider().repeatShipment("VG-2")).toBe("VG-9");
    expect(posted[0]).toMatchObject({ path: "/shipments", body: { origin: 2, destination: 4, vehicle: 1, device: 2 } });
    expect(posted[1]).toEqual({
      path: "/shipment-items",
      body: { shipment: 9, fruit: 1, lot: "MG-2810-07", quantity_kg: "4500.00" },
    });
  });

  it("reuses an identical planned trip instead of creating a duplicate", async () => {
    const twin = { ...shipment, id: 8, status: "planned" };
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (init?.method === "POST") throw new Error("should not create");
      if (url.pathname.endsWith("/shipments") && url.searchParams.get("status") === "planned") {
        return new Response(JSON.stringify(page([twin])), { status: 200 });
      }
      return new Response(JSON.stringify(routes[url.pathname.replace("/api/v1", "")]), { status: 200 });
    });
    expect(await new ApiDataProvider().repeatShipment("VG-2")).toBe("VG-8");
  });

  it("shows the backend message when starting a trip fails", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ detail: "Este dispositivo já está em outra viagem em andamento." }), { status: 400 })
    );
    await expect(new ApiDataProvider().startShipment("VG-3")).rejects.toThrow("outra viagem em andamento");
  });

  it("loads every reading of the trip for the 'custom' range", async () => {
    await new ApiDataProvider().getReadingHistory("VG-2", "custom");
    expect(fetchMock.mock.calls[0][0]).not.toContain("start=");
  });

  it("acknowledges via POST /alerts/{id}/ack", async () => {
    await new ApiDataProvider().acknowledgeAlert("7");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/alerts/7/ack`);
    expect(init.method).toBe("POST");
  });

  it("refreshes the access token once on 401 and retries", async () => {
    let first = true;
    fetchMock.mockImplementation(async (input: string) => {
      if (input.endsWith("/auth/refresh")) return new Response(JSON.stringify({ data: { access: "new-access" } }), { status: 200 });
      if (first) {
        first = false;
        return new Response(JSON.stringify({ detail: "expirado" }), { status: 401 });
      }
      return new Response(JSON.stringify(page([])), { status: 200 });
    });
    await new ApiDataProvider().getAlerts();
    expect(getSession()?.access).toBe("new-access");
    const retry = fetchMock.mock.calls[2][1].headers as Record<string, string>;
    expect(retry.Authorization).toBe("Bearer new-access");
  });

  it("clears the session when refresh fails", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ detail: "inválido" }), { status: 401 }));
    await expect(new ApiDataProvider().getAlerts()).rejects.toThrow("Sua sessão expirou");
    expect(getSession()).toBeNull();
  });
});
