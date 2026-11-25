import { Component, input } from '@angular/core';
import type { Departure } from '../interfaces/departure.interface';
import type { LineStyle } from '../interfaces/line-style.interface';

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
    const lineId = this.departure().arrival.line_id?.trim();
    if (!lineId) return { backgroundColor: '#edf4ef', color: '#2f7650' };
    const normalizedLineId = this.normalizedLineId(lineId);
    return this.lineStyles().get(lineId) ??
      this.lineStyles().get(normalizedLineId) ??
      this.lineStyles().get(this.formatLineId()) ??
      { backgroundColor: '#edf4ef', color: '#2f7650' };
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
    if (arrival.estimated_arrival_unix !== timestamp) return null;
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
    return this.isEstimatedArrival()
      ? `${time}, estimado`
      : `${time}, horário previsto`;
  }
}
