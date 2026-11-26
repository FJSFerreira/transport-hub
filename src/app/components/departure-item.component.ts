import { Component, input } from '@angular/core';
import type { Departure } from '../interfaces/departure.interface';
import type { LineStyle } from '../interfaces/line-style.interface';
import { getOperatorLineStyle } from '../operator-config';

@Component({
  selector: 'app-departure-item',
  templateUrl: './departure-item.component.html',
  styles: ':host { display: block; }',
  styleUrl: '../app.css',
})
export class DepartureItemComponent {
  readonly departure = input.required<Departure>();
  readonly lineStyles = input<ReadonlyMap<string, LineStyle>>(new Map());

  formatLineId(): string {
    const lineId = this.departure().arrival.line_id?.trim();
    if (!lineId) return '—';
    return this.normalizedLineId(lineId).replace(/_\d+$/, '') || '—';
  }

  lineStyle(): LineStyle {
    const { operatorId, arrival } = this.departure();
    const lineId = arrival.line_id?.trim();
    if (!lineId) {
      return getOperatorLineStyle(operatorId) ?? {
        backgroundColor: '#edf4ef',
        color: '#2f7650',
      };
    }
    const normalizedLineId = this.normalizedLineId(lineId);
    const operatorStyle = operatorId
      ? this.lineStyles().get(`${operatorId}:${lineId}`) ??
        this.lineStyles().get(`${operatorId}:${normalizedLineId}`) ??
        this.lineStyles().get(`${operatorId}:${this.formatLineId()}`)
      : undefined;
    return operatorStyle ?? getOperatorLineStyle(operatorId) ?? {
      backgroundColor: '#edf4ef',
      color: '#2f7650',
    };
  }

  private normalizedLineId(lineId: string): string {
    const separator = lineId.lastIndexOf(':');
    const routeId = separator >= 0 ? lineId.slice(separator + 1) : lineId;
    return routeId.replace(/^\[[^\]]+\]/, '');
  }

  isEstimatedArrival(): boolean {
    const { arrival, timestamp } = this.departure();
    return arrival.estimated_arrival_unix === timestamp;
  }

  scheduledDepartureTime(): string | null {
    const { arrival, timestamp } = this.departure();
    if (arrival.cancelled || arrival.estimated_arrival_unix !== timestamp) return null;
    const scheduled = arrival.scheduled_arrival_unix;
    return typeof scheduled === 'number'
      ? new Date(scheduled * 1000).toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
  }

  formatDeparture(): string {
    return new Date(this.departure().timestamp * 1000)
      .toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  }

  departureAriaLabel(): string {
    const time = this.formatDeparture();
    if (this.departure().arrival.cancelled) return `${time}, partida cancelada`;
    return this.isEstimatedArrival()
      ? `${time}, estimado`
      : `${time}, horário previsto`;
  }
}
