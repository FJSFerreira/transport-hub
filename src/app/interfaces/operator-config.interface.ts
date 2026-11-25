import type { Type } from '@angular/core';
import type { OperatorService } from './operator-service.interface';

export interface OperatorConfig {
  id: string;
  stopColor: string;
  service: Type<OperatorService>;
}
