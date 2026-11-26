import type { Type } from '@angular/core';
import type { OperatorService } from './operator-service.interface';

export interface OperatorConfig {
  id: string;
  name: string;
  stopBackgroundColor: string;
  stopForegroundColor: string;
  service: Type<OperatorService>;
}
