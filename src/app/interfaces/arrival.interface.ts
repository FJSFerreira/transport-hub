export interface Arrival {
  line_id?: string;
  headsign?: string;
  pattern_id?: string | null;
  stop_sequence?: number | null;
  scheduled_arrival?: string | null;
  scheduled_arrival_unix?: number | null;
  estimated_arrival?: string | null;
  estimated_arrival_unix?: number | null;
  observed_arrival_unix?: number | null;
}
