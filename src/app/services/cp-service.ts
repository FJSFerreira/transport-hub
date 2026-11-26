import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import type { Arrival } from '../interfaces/arrival.interface';
import type { LineRecord } from '../interfaces/line-record.interface';
import type { OperatorService } from '../interfaces/operator-service.interface';
import type { Pattern } from '../interfaces/pattern.interface';
import type { Stop } from '../interfaces/stop.interface';
import type { VehiclePosition } from '../interfaces/vehicle-position.interface';

const STATIONS_URL = '/api/cp/stations';
const CP_DEPARTURES_VIEW = 'DEPARTURES';

type CpRecord = Record<string, unknown>;

interface CpStationRecord {
  id?: string | number;
  stationId?: string | number;
  station_id?: string | number;
  code?: string | number;
  stationCode?: string | number;
  station_code?: string | number;
  name?: string;
  stationName?: string;
  station_name?: string;
  designation?: string;
  latitude?: string | number;
  lat?: string | number;
  longitude?: string | number;
  lon?: string | number;
  lng?: string | number;
}

@Injectable({ providedIn: 'root' })
export class CpService implements OperatorService {
  private readonly http = inject(HttpClient);

  getStops(): Observable<Stop[]> {
    return this.getStations();
  }

  getStations(): Observable<Stop[]> {
    return this.http.get<unknown>(STATIONS_URL).pipe(
      map((response) => {
        const records = Array.isArray(response)
          ? response
          : typeof response === 'object' && response !== null
            ? 'data' in response
              ? response.data
              : 'stations' in response
                ? response.stations
                : 'items' in response
                  ? response.items
                  : null
            : null;
        if (!Array.isArray(records)) {
          throw new Error('The CP stations service returned an invalid response.');
        }

        return records.flatMap((value): Stop[] => {
          if (typeof value !== 'object' || value === null) return [];
          const record = value as CpStationRecord;
          const rawId =
            record.id ??
            record.stationId ??
            record.station_id ??
            record.code ??
            record.stationCode ??
            record.station_code;
          const latitude = parseCoordinate(record.latitude ?? record.lat);
          const longitude = parseCoordinate(record.longitude ?? record.lon ?? record.lng);
          if (
            rawId === undefined ||
            rawId === null ||
            latitude === undefined ||
            longitude === undefined ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180
          ) {
            return [];
          }

          const id = String(rawId);
          return [{
            id,
            name:
              record.name ||
              record.stationName ||
              record.station_name ||
              record.designation ||
              id,
            latitude,
            longitude,
          }];
        });
      }),
    );
  }

  getLines(): Observable<LineRecord[]> {
    return of([]);
  }

  getVehiclePositions(): Observable<VehiclePosition[]> {
    return of([]);
  }

  getArrivals(stopId: string): Observable<Arrival[]> {
    const now = new Date();
    const date = formatDate(now);
    const start = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return this.http
      .get<unknown>(
        `/api/cp/stations/${encodeURIComponent(stopId)}/timetable/${date}`,
        { params: { view: CP_DEPARTURES_VIEW, start } },
      )
      .pipe(map((response) => normalizeCpDepartures(response, date)));
  }

  getPattern(patternId: string): Observable<Pattern> {
    return of({ id: patternId, path: [] });
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isRecord(value: unknown): value is CpRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecords(response: unknown): CpRecord[] {
  const payload = isRecord(response) && 'data' in response ? response['data'] : response;
  const records = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? payload['departures'] ??
        payload['timetable'] ??
        payload['stationStops'] ??
        payload['trains'] ??
        payload['connections'] ??
        payload['items'] ??
        payload['services']
      : null;
  if (!Array.isArray(records) || !records.every(isRecord)) {
    throw new Error('The CP timetable service returned an invalid response.');
  }
  return records;
}

function getValue(record: CpRecord, keys: string[]): unknown {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
}

function getText(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isRecord(value)) {
    const nestedValue = getValue(value, ['name', 'designation', 'label', 'description']);
    return nestedValue === undefined ? undefined : getText(nestedValue);
  }
  return undefined;
}

function parseTimestamp(value: unknown, date: string): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const timeOnly = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const timestamp = timeOnly
    ? new Date(
        `${date}T${timeOnly[1].padStart(2, '0')}:${timeOnly[2]}:${timeOnly[3] ?? '00'}`,
      ).getTime()
    : Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : undefined;
}

function normalizeCpDepartures(response: unknown, date: string): Arrival[] {
  const records = getRecords(response);
  const arrivals = records.flatMap((record): Arrival[] => {
    const scheduledValue = getValue(record, [
      'scheduledDepartureTime',
      'scheduled_departure_time',
      'plannedDepartureTime',
      'planned_departure_time',
      'departureDateTime',
      'departure_datetime',
      'departureTime',
      'departure_time',
      'time',
    ]);
    const scheduledTimestamp = parseTimestamp(scheduledValue, date);
    if (scheduledTimestamp === undefined) return [];

    const estimatedValue = getValue(record, [
      'ETD',
      'estimatedDepartureTime',
      'estimated_departure_time',
      'realTime',
      'realtime',
    ]);
    const estimatedTimestamp = parseTimestamp(estimatedValue, date);
    const trainService = record['trainService'];
    const lineId =
      (isRecord(trainService) ? getText(trainService['code']) : undefined) ??
      getText(getValue(record, ['line_id', 'lineId', 'serviceNumber']));
    const headsign = getText(
      getValue(record, [
        'trainDestination',
        'destination',
        'destinationName',
        'destination_name',
        'headsign',
        'to',
      ]),
    );
    const suppression = getValue(record, ['suppression', 'supression']);
    const cancelled = isRecord(suppression) && suppression['code'] === 'CANCELLED';

    return [{
      line_id: lineId,
      headsign,
      ...(cancelled ? { cancelled: true } : {}),
      scheduled_arrival:
        typeof scheduledValue === 'string'
          ? scheduledValue
          : new Date(scheduledTimestamp * 1000).toISOString(),
      scheduled_arrival_unix: scheduledTimestamp,
      ...(estimatedTimestamp === undefined
        ? {}
        : {
            estimated_arrival:
              typeof estimatedValue === 'string'
                ? estimatedValue
                : new Date(estimatedTimestamp * 1000).toISOString(),
            estimated_arrival_unix: estimatedTimestamp,
          }),
    }];
  });

  if (records.length > 0 && arrivals.length === 0) {
    throw new Error('The CP timetable response contained no usable departure times.');
  }
  return arrivals;
}

function parseCoordinate(value: string | number | undefined): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    return undefined;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}
