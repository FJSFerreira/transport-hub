import type { PatternStop } from './pattern-stop.interface';

export interface Pattern {
  id: string;
  path: PatternStop[];
}
