import { Component, input, output } from '@angular/core';
import type { LineStyle } from '../interfaces/line-style.interface';
import type { Stop } from '../interfaces/stop.interface';
import type { Departure } from '../interfaces/departure.interface';
import { DepartureItemComponent } from './departure-item.component';

@Component({
  selector: 'app-departures-panel',
  templateUrl: './departures-panel.component.html',
  imports: [DepartureItemComponent],
  styles: ':host { min-height: 0; height: 100%; }',
  styleUrl: '../app.css',
})
export class DeparturesPanelComponent {
  readonly stop = input<Stop | null>(null);
  readonly departures = input<Departure[]>([]);
  readonly loading = input(false);
  readonly error = input('');
  readonly lineStyles = input<ReadonlyMap<string, LineStyle>>(new Map());
  readonly close = output();
  readonly retry = output();
}
