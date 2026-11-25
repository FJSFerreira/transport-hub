import { Component, input, output } from '@angular/core';
import type { Stop } from '../interfaces/stop.interface';
import { StatePanelComponent } from './state-panel.component';
import { StopRowComponent } from './stop-row.component';

@Component({
  selector: 'app-stops-list',
  templateUrl: './stops-list.component.html',
  styles: ':host { min-height: 0; flex: 1; display: flex; }',
  styleUrl: '../app.css',
  imports: [StatePanelComponent, StopRowComponent],
})
export class StopsListComponent {
  readonly stops = input<Stop[]>([]);
  readonly totalCount = input(0);
  readonly distanceFormatter = input<(stop: Stop) => string>(() => '—');
  readonly stopSelected = output<Stop>();
  readonly scroll = output<Event>();

  formatDistance(stop: Stop): string {
    return this.distanceFormatter()(stop);
  }
}
