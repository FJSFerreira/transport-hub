export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  municipality_name?: string;
  locality_name?: string;
  parish_name?: string;
  line_ids?: string[];
  operatorIds?: string[];
}
