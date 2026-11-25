export interface StopRecord {
  id?: string | number;
  _id?: string | number;
  long_name?: string;
  name?: string;
  short_name?: string;
  lat?: number;
  latitude?: number;
  lon?: number;
  longitude?: number;
  municipality_name?: string;
  locality_name?: string;
  parish_name?: string;
  line_ids?: string[];
}
