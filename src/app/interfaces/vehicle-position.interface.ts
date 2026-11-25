export interface VehiclePosition {
  id: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  routeId?: string;
  stopId?: string;
  operatorId?: string;
}
