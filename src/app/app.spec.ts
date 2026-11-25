import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import {
  App,
  distanceBetweenCoordinates,
  isTerminatingAtStop,
  mergeOperatorStops,
  normalizeVehicleRecords,
  selectUpcomingArrivals,
} from './app';
import { routes } from './app.routes';
import { DepartureItemComponent } from './components/departure-item.component';
import {
  CMET_OPERATOR_ID,
  CMET_MARKER_COLOR,
  getStopMarkerBackground,
} from './operator-stop-colors';
import { CmetService } from './services/cmet-service';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  describe('selectUpcomingArrivals', () => {
    it('hides future trips terminating at the selected stop', () => {
      const currentStop = {
        id: '180291',
        name: 'Estação de São João',
        latitude: 0,
        longitude: 0,
      };
      expect(isTerminatingAtStop(
        {
          pattern_id: '[BNA17]2927_0_1',
          stop_sequence: 41,
        },
        {
          id: '2927_0_1',
          path: [
            { stop_id: '181007', stop_sequence: 0 },
            { stop_id: '180291', stop_sequence: 32 },
          ],
        },
        currentStop,
      )).toBe(true);
      expect(isTerminatingAtStop(
        {
          pattern_id: '[BNA17]2927_0_2',
          stop_sequence: 0,
        },
        {
          id: '2927_0_2',
          path: [
            { stop_id: '180291', stop_sequence: 0 },
            { stop_id: '181007', stop_sequence: 31 },
          ],
        },
        currentStop,
      )).toBe(false);
    });

    it('uses configured operator colors and combines colors for shared stops', () => {
      expect(getStopMarkerBackground([CMET_OPERATOR_ID])).toBe(CMET_MARKER_COLOR);
      expect(
        getStopMarkerBackground(['operator-a', 'operator-b'], {
          'operator-a': '#112233',
          'operator-b': '#445566',
        }),
      ).toBe('conic-gradient(#112233 0% 50%, #445566 50% 100%)');
    });

    it('merges stops from operators while preserving each operator and line', () => {
      expect(
        mergeOperatorStops([
          {
            operatorId: CMET_OPERATOR_ID,
            stops: [{
              id: 'shared',
              name: 'Shared stop',
              latitude: 38.9,
              longitude: -9,
              line_ids: ['1001'],
            }],
          },
          {
            operatorId: 'other-operator',
            stops: [{
              id: 'shared',
              name: 'Alternate name',
              latitude: 38.91,
              longitude: -9.01,
              line_ids: ['2001'],
            }],
          },
        ]),
      ).toEqual([
        {
          id: 'shared',
          name: 'Shared stop',
          latitude: 38.9,
          longitude: -9,
          line_ids: ['1001', '2001'],
          operatorIds: [CMET_OPERATOR_ID, 'other-operator'],
        },
      ]);
    });

    it('keeps circular-route departures and hides only the return to the same stop', () => {
      const currentStop = {
        id: '180291',
        name: 'Estação de São João',
        latitude: 0,
        longitude: 0,
      };
      const circularPattern = {
        id: '2337_0_3',
        path: [
          { stop_id: '180291', stop_sequence: 0 },
          { stop_id: '180599', stop_sequence: 1 },
          { stop_id: '180291', stop_sequence: 20 },
        ],
      };

      expect(isTerminatingAtStop(
        { pattern_id: '[BNA17]2337_0_3', stop_sequence: 0 },
        circularPattern,
        currentStop,
      )).toBe(false);
      expect(isTerminatingAtStop(
        { pattern_id: '[BNA17]2337_0_3', stop_sequence: 20 },
        circularPattern,
        currentStop,
      )).toBe(true);
    });

    it('shows every future trip without a time-window limit', () => {
      const now = 1_000;
      const selected = selectUpcomingArrivals(
        [
          { line_id: 'past', scheduled_arrival_unix: 999 },
          { line_id: 'first', scheduled_arrival_unix: 1_100 },
          { line_id: 'second', scheduled_arrival_unix: 1_500 },
          { line_id: 'third', scheduled_arrival_unix: 2_000 },
          { line_id: 'later', scheduled_arrival_unix: 8_201 },
        ],
        now,
      );

      expect(selected.map(({ arrival }) => arrival.line_id)).toEqual([
        'first',
        'second',
        'third',
        'later',
      ]);
    });

    it('loads patterns after removing the agency prefix from the pattern ID', () => {
      let response: unknown;
      TestBed.inject(CmetService)
        .getPattern('[BNA17]2337_0_3')
        .subscribe((pattern) => (response = pattern));

      http.expectOne('https://api.carrismetropolitana.pt/v2/patterns/2337_0_3').flush([
        {
          id: '2337_0_3',
          path: [
            { stop_id: '180291', stop_sequence: 0 },
            { stop_id: '180598', stop_sequence: 17 },
          ],
        },
      ]);

      expect(response).toEqual({
        id: '2337_0_3',
        path: [
          { stop_id: '180291', stop_sequence: 0 },
          { stop_id: '180598', stop_sequence: 17 },
        ],
      });
    });

    describe('distanceBetweenCoordinates', () => {
      it('calculates the distance between two geographic coordinates', () => {
        expect(distanceBetweenCoordinates(0, 0, 1, 0)).toBeCloseTo(111_195, 0);
      });
    });

    it('excludes trips that have already departed', () => {
      const selected = selectUpcomingArrivals(
        [
          { line_id: 'past', scheduled_arrival_unix: 999 },
          { line_id: 'soon', scheduled_arrival_unix: 1_100 },
          { line_id: 'later', scheduled_arrival_unix: 8_201 },
        ],
        1_000,
      );

      expect(selected.map(({ arrival }) => arrival.line_id)).toEqual(['soon', 'later']);
    });
  });

  it('normalizes vehicle JSON records and ignores invalid coordinates', () => {
    expect(
      normalizeVehicleRecords([
        {
          id: '[LA77N]765',
          lat: 38.75,
          lon: -9.19,
          bearing: 225,
          route_id: '[LA77N]1721_0',
          stop_id: '180598',
        },
        { id: 'invalid', lat: null, lon: -9.19 },
      ]),
    ).toEqual([
      {
        id: '[LA77N]765',
        latitude: 38.75,
        longitude: -9.19,
        bearing: 225,
        routeId: '[LA77N]1721_0',
        stopId: '180598',
      },
    ]);
  });

  afterEach(() => http.verify());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    http.expectOne('https://api.carrismetropolitana.pt/v2/stops').flush([
      {
        id: '180598',
        long_name: 'R António Sérgio 21',
        lat: 38.961093,
        lon: -8.988657,
        line_ids: ['2331', '2337'],
      },
    ]);
    http.expectOne('https://api.carrismetropolitana.pt/v2/lines').flush([
      {
        id: '2331',
        short_name: '2331',
        color: '#C61D23',
        text_color: '#FFFFFF',
      },
    ]);
    expect(compiled.querySelector('.workspace')).toBeTruthy();
    expect(compiled.querySelector('.view-switch')).toBeTruthy();
    expect(compiled.querySelector('.results-bar')).toBeNull();
    expect(compiled.querySelector('.search-bar .locate-control')).toBeTruthy();
    const layerToggles = compiled.querySelectorAll<HTMLButtonElement>('.map-layer-toggle');
    expect(layerToggles).toHaveLength(2);
    layerToggles[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.stopsVisible()).toBe(false);
    expect(compiled.querySelector('.intro')).toBeNull();
    expect(compiled.querySelector('footer')).toBeNull();
    expect(fixture.componentInstance.stops()[0]).toMatchObject({
      id: '180598',
      name: 'R António Sérgio 21',
      latitude: 38.961093,
      longitude: -8.988657,
    });
    expect(fixture.componentInstance.lineStyle('[BNA17]2331')).toEqual({
      backgroundColor: '#C61D23',
      color: '#FFFFFF',
    });
    const estimated = Date.UTC(2026, 0, 1, 12, 30) / 1000;
    expect(
      fixture.componentInstance.scheduledDepartureTime(
        {
          estimated_arrival_unix: estimated,
          scheduled_arrival_unix: estimated + 300,
        },
        estimated,
      ),
    ).toBe(fixture.componentInstance.formatDeparture(estimated + 300));
    expect(
      fixture.componentInstance.scheduledDepartureTime(
        {
          estimated_arrival_unix: estimated,
          scheduled_arrival_unix: estimated + 30,
        },
        estimated,
      ),
    ).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('displays normalized line numbers and omits the scheduled-time label', () => {
    const fixture = TestBed.createComponent(DepartureItemComponent);
    fixture.componentRef.setInput('departure', {
      arrival: {
        line_id: '[LA77N]1721_0',
        estimated_arrival_unix: 1_000,
        scheduled_arrival_unix: 1_200,
      },
      timestamp: 1_000,
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.departure-line')?.textContent?.trim()).toBe('1721');
    expect(element.querySelector('.scheduled-departure')?.textContent).not.toContain('programada');
  });
});
