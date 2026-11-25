import type { Observable } from 'rxjs';
import type { Arrival } from './arrival.interface';
import type { LineRecord } from './line-record.interface';
import type { Pattern } from './pattern.interface';
import type { Stop } from './stop.interface';
import type { VehiclePosition } from './vehicle-position.interface';

export interface OperatorService {
  getStops(): Observable<Stop[]>;
  getLines(): Observable<LineRecord[]>;
  getVehiclePositions(): Observable<VehiclePosition[]>;
  getArrivals(stopId: string): Observable<Arrival[]>;
  getPattern(patternId: string): Observable<Pattern>;
}
