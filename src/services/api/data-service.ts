import type {
  LogisticsStatus,
  DashboardSummary,
  Shipment,
  ShipmentFilters,
  SensorReading,
  TimeRange,
  GeoPosition,
  MonitoringAlert,
  AlertFilters,
  AppNotification,
  FruitStorageProfile,
  DeliveryConfirmation,
  NewTrip,
  TripFormOptions,
  TripOption,
  ChatTurn,
} from "@/types";

export interface DataService {
  getDashboardSummary(): Promise<DashboardSummary>;
  getShipments(filters?: ShipmentFilters): Promise<Shipment[]>;
  getShipmentById(id: string): Promise<Shipment | null>;
  getLatestReadings(shipmentId: string): Promise<SensorReading | null>;
  getReadingHistory(
    shipmentId: string,
    range: TimeRange
  ): Promise<SensorReading[]>;
  getShipmentPositions(shipmentId: string): Promise<GeoPosition[]>;
  getAlerts(filters?: AlertFilters): Promise<MonitoringAlert[]>;
  acknowledgeAlert(id: string): Promise<void>;
  resolveAlert(id: string): Promise<void>;
  startShipment(id: string): Promise<void>;
  /** Returns the new status: "awaiting_confirmation" on the backend with buyer confirmation, "delivered" before it. */
  finishShipment(id: string): Promise<LogisticsStatus>;
  /** Creates a new planned trip with the same route, vehicle, board and cargo; returns its id. */
  repeatShipment(id: string): Promise<string>;
  /** Locations, trucks, boards and fruits the user can pick when creating a trip. */
  getTripFormOptions(): Promise<TripFormOptions>;
  /** Buyers or drivers to choose from; null while the backend has no user list (type the id instead). */
  getPeople(role: "buyer" | "driver"): Promise<TripOption[] | null>;
  /** Creates a planned trip with its cargo; returns its id. */
  createShipment(trip: NewTrip): Promise<string>;
  /** The buyer confirms receipt: "awaiting_confirmation" -> "delivered". */
  confirmDelivery(id: string, confirmation: DeliveryConfirmation): Promise<void>;
  /** The logged driver's planned, active and delivered trips. */
  getMyTrips(): Promise<Shipment[]>;
  /** Asks the assistant (Gemini on the backend); returns its answer. */
  askAssistant(message: string, options: { shipmentId?: string; history: ChatTurn[] }): Promise<string>;
  /** Drops the cached locations, vehicles and boards (after editing a registration). */
  invalidateLookups(): void;
  getFruitProfiles(): Promise<FruitStorageProfile[]>;
  getNotifications(): Promise<AppNotification[]>;
}
