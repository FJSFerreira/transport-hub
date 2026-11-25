import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { Arrival } from '../interfaces/arrival.interface';
import type { LineRecord } from '../interfaces/line-record.interface';
import type { Pattern } from '../interfaces/pattern.interface';
import type { Stop } from '../interfaces/stop.interface';
import type { StopRecord } from '../interfaces/stop-record.interface';
import type { VehiclePosition } from '../interfaces/vehicle-position.interface';
import type { VehicleRecord } from '../interfaces/vehicle-record.interface';

const CMET_API_BASE_URL = 'https://api.carrismetropolitana.pt/v2';
const STOPS_URL = `${CMET_API_BASE_URL}/stops`;
const LINES_URL = `${CMET_API_BASE_URL}/lines`;
const ARRIVALS_URL = `${CMET_API_BASE_URL}/arrivals/by_stop`;
const PATTERNS_URL = `${CMET_API_BASE_URL}/patterns`;
const VEHICLES_URL = `${CMET_API_BASE_URL}/vehicles`;

export class InvalidTransitApiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitApiResponseError';
  }
}

@Injectable({ providedIn: 'root' })
export class CmetService {
  private readonly http = inject(HttpClient);

  getStops(): Observable<Stop[]> {
    return this.getRecords<StopRecord>(STOPS_URL, 'A resposta do serviço não contém uma lista de paragens.')
      .pipe(map((records) => records.flatMap((record) => {
        const id = record.id ?? record._id;
        if (id === undefined || id === null) return [];
        return [{
          id: String(id),
          name: record.long_name || record.name || record.short_name || String(id),
          latitude: Number(record.lat ?? record.latitude),
          longitude: Number(record.lon ?? record.longitude),
          municipality_name: record.municipality_name,
          locality_name: record.locality_name,
          parish_name: record.parish_name,
          line_ids: record.line_ids,
        }];
      })));
  }

  getLines(): Observable<LineRecord[]> {
    return this.getRecords<LineRecord>(LINES_URL, 'The line colors service returned an invalid response.');
  }

  getVehiclePositions(): Observable<VehiclePosition[]> {
    return this.getRecords<VehicleRecord>(VEHICLES_URL, 'O serviço devolveu posições de veículos inválidas.')
      .pipe(map(normalizeVehicleRecords));
  }

  getArrivals(stopId: string): Observable<Arrival[]> {
    return this.http.get<unknown>(`${ARRIVALS_URL}/${encodeURIComponent(stopId)}`).pipe(
      map((response) => {
        if (!Array.isArray(response)) {
          throw new InvalidTransitApiResponseError('Não foi possível carregar as partidas.');
        }
        return response as Arrival[];
      }),
    );
  }

  getPattern(patternId: string): Observable<Pattern> {
    const normalizedPatternId = patternId.replace(/^\[[^\]]+\]/, '');
    return this.getRecords<Pattern>(
      `${PATTERNS_URL}/${encodeURIComponent(normalizedPatternId)}`,
      'Não foi possível carregar o padrão das partidas.',
    ).pipe(
      map((patterns) => {
        const pattern = patterns[0];
        if (
          !pattern ||
          pattern.id !== normalizedPatternId ||
          !Array.isArray(pattern.path) ||
          pattern.path.length === 0 ||
          !pattern.path.every(
            (stop) =>
              typeof stop === 'object' &&
              stop !== null &&
              typeof stop.stop_id === 'string' &&
              typeof stop.stop_sequence === 'number' &&
              Number.isFinite(stop.stop_sequence),
          )
        ) {
          throw new InvalidTransitApiResponseError(
            'O padrão devolvido não contém a sequência de paragens.',
          );
        }
        return pattern;
      }),
    );
  }

  private getRecords<T>(url: string, errorMessage: string): Observable<T[]> {
    return this.http.get<unknown>(url).pipe(
      map((response) => {
        const records = Array.isArray(response)
          ? response
          : typeof response === 'object' && response !== null && 'data' in response
            ? response.data
            : null;
        if (!Array.isArray(records)) {
          throw new InvalidTransitApiResponseError(errorMessage);
        }
        return records as T[];
      }),
    );
  }
}

export function normalizeVehicleRecords(records: VehicleRecord[]): VehiclePosition[] {
  return records.flatMap((record) => {
    if (
      !record.id ||
      typeof record.lat !== 'number' ||
      !Number.isFinite(record.lat) ||
      typeof record.lon !== 'number' ||
      !Number.isFinite(record.lon)
    ) {
      return [];
    }

    const position: VehiclePosition = {
      id: record.id,
      latitude: record.lat,
      longitude: record.lon,
      routeId: record.route_id ?? undefined,
      stopId: record.stop_id ?? undefined,
    };
    if (typeof record.bearing === 'number' && Number.isFinite(record.bearing)) {
      position.bearing = ((record.bearing % 360) + 360) % 360;
    }
    return [position];
  });
}
