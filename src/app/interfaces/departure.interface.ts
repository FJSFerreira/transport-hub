import type { Arrival } from './arrival.interface';

export interface Departure {
  arrival: Arrival;
  timestamp: number;
}
