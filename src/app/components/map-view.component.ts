import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-map-view',
  imports: [DecimalPipe],
  templateUrl: './map-view.component.html',
  styles: ':host { min-height: 0; height: 100%; display: flex; }',
  styleUrl: '../app.css',
})
export class MapViewComponent {
  readonly visibleCount = input(0);
  readonly vehicleError = input('');
  readonly locationError = input('');
}
