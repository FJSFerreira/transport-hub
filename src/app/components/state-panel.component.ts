import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-state-panel',
  templateUrl: './state-panel.component.html',
  styles: ':host { min-height: 0; flex: 1; display: flex; }',
  styleUrl: '../app.css',
})
export class StatePanelComponent {
  readonly kind = input<'loading' | 'error' | 'empty'>('empty');
  readonly title = input('');
  readonly message = input('');
  readonly actionLabel = input('');
  readonly action = output();
}
