import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-search-toolbar',
  templateUrl: './search-toolbar.component.html',
  styles: ':host { position: static; }',
  styleUrl: '../app.css',
})
export class SearchToolbarComponent {
  readonly search = input('');
  readonly view = input<'map' | 'list'>('map');
  readonly locating = input(false);
  readonly hasSelectedStop = input(false);
  readonly stopsVisible = input(true);
  readonly vehiclesVisible = input(true);
  readonly searchChange = output<Event>();
  readonly clearSearch = output();
  readonly viewChange = output<'map' | 'list'>();
  readonly locate = output();
  readonly stopsVisibleChange = output<boolean>();
  readonly vehiclesVisibleChange = output<boolean>();
}
