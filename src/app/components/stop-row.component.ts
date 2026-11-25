import { Component, input, output } from '@angular/core';
import type { Stop } from '../interfaces/stop.interface';

@Component({
  selector: 'app-stop-row',
  templateUrl: './stop-row.component.html',
  styles: ':host { display: block; }',
  styleUrl: '../app.css',
})
export class StopRowComponent {
  readonly stop = input.required<Stop>();
  readonly distance = input('—');
  readonly stopSelected = output<Stop>();
}
