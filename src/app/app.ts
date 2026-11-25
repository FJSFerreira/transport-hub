import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin, map, of, switchMap } from 'rxjs';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import type { Arrival } from './interfaces/arrival.interface';
import type { Coordinates } from './interfaces/coordinates.interface';
import type { LineRecord } from './interfaces/line-record.interface';
import type { LineStyle } from './interfaces/line-style.interface';
import type { Pattern } from './interfaces/pattern.interface';
import type { Stop } from './interfaces/stop.interface';
import type { VehicleLineDetails } from './interfaces/vehicle-line-details.interface';
import type { VehiclePosition } from './interfaces/vehicle-position.interface';
import {
  getStopMarkerBackground,
  OPERATOR_CONFIGS,
} from './operator-stop-colors';
import { InvalidTransitApiResponseError } from './services/cmet-service';
import { SearchToolbarComponent } from './components/search-toolbar.component';
import { MapViewComponent } from './components/map-view.component';
import { DeparturesPanelComponent } from './components/departures-panel.component';
import { StopsListComponent } from './components/stops-list.component';
import { StatePanelComponent } from './components/state-panel.component';

const VEHICLE_REFRESH_INTERVAL = 60_000;
const VEHICLE_MIN_ZOOM = 15;
const INITIAL_MAP_CENTER = { latitude: 38.7223, longitude: -9.1393 };
let preservedMapView: { latitude: number; longitude: number; zoom: number } | null = null;
const DEFAULT_LINE_STYLE: LineStyle = {
  backgroundColor: '#edf4ef',
  color: '#2f7650',
};
export { normalizeVehicleRecords } from './services/cmet-service';
export type { Arrival } from './interfaces/arrival.interface';
export type { LineStyle } from './interfaces/line-style.interface';
export type { Stop } from './interfaces/stop.interface';
export type { VehiclePosition } from './interfaces/vehicle-position.interface';

export function mergeOperatorStops(
  results: { operatorId: string; stops: Stop[] }[],
): Stop[] {
  const mergedStops = new Map<string, Stop>();

  for (const { operatorId, stops } of results) {
    for (const stop of stops) {
      const existing = mergedStops.get(stop.id);
      mergedStops.set(stop.id, {
        ...(existing ?? stop),
        line_ids: [...new Set([...(existing?.line_ids ?? []), ...(stop.line_ids ?? [])])],
        operatorIds: [
          ...new Set([...(existing?.operatorIds ?? []), ...(stop.operatorIds ?? []), operatorId]),
        ],
      });
    }
  }

  return [...mergedStops.values()];
}

export function distanceBetweenCoordinates(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function selectUpcomingArrivals(
  arrivals: Arrival[],
  now: number,
): { arrival: Arrival; timestamp: number }[] {
  const future = arrivals
    .map((arrival) => {
      const estimate = arrival.estimated_arrival_unix;
      const scheduled = arrival.scheduled_arrival_unix;
      const estimateIsFuture = typeof estimate === 'number' && estimate >= now;
      const timestamp = estimateIsFuture
        ? estimate
        : typeof scheduled === 'number'
          ? scheduled
          : null;
      return { arrival, timestamp };
    })
    .filter(
      (item): item is { arrival: Arrival; timestamp: number } =>
        item.timestamp !== null && item.timestamp >= now,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  return future;
}

function normalizePatternId(patternId: string): string {
  return patternId.replace(/^\[[^\]]+\]/, '');
}

export function isTerminatingAtStop(
  arrival: Arrival,
  pattern: Pattern,
  stop: Stop,
): boolean {
  if (
    !arrival.pattern_id ||
    normalizePatternId(arrival.pattern_id) !== pattern.id ||
    pattern.path.length === 0
  ) {
    return false;
  }
  const finalStop = pattern.path.reduce((last, candidate) =>
    candidate.stop_sequence > last.stop_sequence ? candidate : last,
  );
  if (finalStop.stop_id !== stop.id) return false;

  const stopOccurrences = pattern.path.filter((candidate) => candidate.stop_id === stop.id);
  return stopOccurrences.length === 1 || arrival.stop_sequence === finalStop.stop_sequence;
}

@Component({
  imports: [
    SearchToolbarComponent,
    MapViewComponent,
    DeparturesPanelComponent,
    StopsListComponent,
    StatePanelComponent,
  ],
  selector: 'app-stops-page',
  templateUrl: './app.html',
  styles: ':host { display: block; height: 100dvh; overflow: hidden; }',
  styleUrl: './app.css',
})
export class App implements OnDestroy {
  private readonly operatorServices = OPERATOR_CONFIGS.map(({ id, service }) => ({
    id,
    service: inject(service),
  }));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private map?: L.Map;
  private markerLayer?: L.MarkerClusterGroup;
  private vehicleLayer?: L.MarkerClusterGroup;
  private readonly markers = new Map<string, L.Marker>();
  private readonly vehicleMarkers = new Map<string, L.Marker>();
  private readonly vehiclePositions = new Map<string, VehiclePosition>();
  private readonly vehicleLinesByRoute = new Map<string, VehicleLineDetails>();
  private locationMarker?: L.CircleMarker;
  private markerUpdateTimer?: ReturnType<typeof setTimeout>;
  private arrivalsRequest?: Subscription;
  private vehicleRequest?: Subscription;
  private vehicleRefreshTimer?: ReturnType<typeof setInterval>;
  private routeSubscription?: Subscription;
  private routeOperatorId: string | null = null;
  private routeStopId: string | null = null;
  private mapFocusFrame?: number;
  private lastMapCenter = { ...INITIAL_MAP_CENTER };
  private locationRequested = false;
  private initialMapLocationRequested = false;

  readonly stops = signal<Stop[]>([]);
  readonly lineStyles = signal<ReadonlyMap<string, LineStyle>>(new Map());
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly view = signal<'map' | 'list'>('map');
  readonly stopsVisible = signal(true);
  readonly vehiclesVisible = signal(true);
  readonly visibleStopCount = signal(40);
  readonly stopBatchSize = 40;
  readonly distanceOrigin = signal<Coordinates>({
    ...INITIAL_MAP_CENTER,
    label: 'Centro do mapa',
  });
  readonly locating = signal(false);
  readonly locationError = signal('');
  readonly vehicleError = signal('');
  readonly selectedStop = signal<Stop | null>(null);
  readonly departures = signal<{ arrival: Arrival; timestamp: number }[]>([]);
  readonly arrivalsLoading = signal(false);
  readonly arrivalsError = signal('');
  readonly filteredStops = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('pt-PT');
    if (!query) return this.stops();

    return this.stops().filter((stop) =>
      [
        stop.id,
        stop.name,
        stop.municipality_name,
        stop.locality_name,
        stop.parish_name,
        ...(stop.line_ids ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('pt-PT').includes(query)),
    );
  });
  readonly distanceSortedStops = computed(() => {
    const origin = this.distanceOrigin();
    return this.filteredStops()
      .map((stop, index) => ({
        stop,
        index,
        distance: this.distanceToStop(stop, origin),
      }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .map(({ stop }) => stop);
  });
  readonly visibleStops = computed(() => {
    return this.distanceSortedStops().slice(0, this.visibleStopCount());
  });

  constructor() {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      this.routeOperatorId = params.get('operator') ?? params.get('operatorId');
      this.routeStopId = params.get('stop') ?? params.get('stopId');
      const routeView = params.get('view');
      if (routeView === 'map' || routeView === 'list') {
        this.applyRouteView(routeView);
      }
      this.syncSelectedStop();
    });

    effect((onCleanup) => {
      const stops = this.filteredStops();
      if (!this.markerLayer) return;

      this.markerUpdateTimer = setTimeout(() => this.renderMarkers(stops), 180);
      onCleanup(() => clearTimeout(this.markerUpdateTimer));
    });

    this.loadStops();
    this.loadLines();
  }

  private loadLines(): void {
    forkJoin(
      this.operatorServices.map(({ id, service }) =>
        service.getLines().pipe(map((records) => ({ operatorId: id, records }))),
      ),
    ).subscribe({
      next: (operatorLines) => {
        const styles = new Map<string, LineStyle>();
        this.vehicleLinesByRoute.clear();
        for (const { operatorId, records } of operatorLines) {
          for (const line of records) {
            const style = this.toLineStyle(line);
            if (style) {
              for (const key of [line.id, line.short_name]) {
                if (key !== undefined && key !== null) styles.set(String(key), style);
              }
            }

            const lineNumber =
              line.short_name || (line.id !== undefined ? String(line.id) : '');
            if (!lineNumber) continue;
            for (const routeId of line.route_ids ?? []) {
              this.vehicleLinesByRoute.set(this.vehicleRouteKey(operatorId, routeId), {
                lineNumber,
              });
            }
          }
        }
        this.lineStyles.set(styles);
        this.updateAllVehicleMarkers();
      },
      error: (error) => console.error('Could not load line colors.', error),
    });
  }

  private toLineStyle(line: LineRecord): LineStyle | null {
    const isHexColor = (value: string | undefined): value is string =>
      value !== undefined && /^#[\da-f]{3,8}$/i.test(value);
    if (!isHexColor(line.color) || !isHexColor(line.text_color)) return null;

    return { backgroundColor: line.color, color: line.text_color };
  }

  private loadStops(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin(
      this.operatorServices.map(({ id, service }) =>
        service.getStops().pipe(map((stops) => ({ operatorId: id, stops }))),
      ),
    )
      .pipe(map(mergeOperatorStops))
      .subscribe({
        next: (stops) => {
          this.stops.set(stops);
          this.loading.set(false);
          this.syncSelectedStop();
          setTimeout(() => {
            this.initializeMap();
            if (
              !this.initialMapLocationRequested &&
              this.view() === 'map' &&
              !this.routeStopId &&
              !preservedMapView
            ) {
              this.initialMapLocationRequested = true;
              this.centerOnCurrentLocation();
            }
          });
        },
        error: (error: unknown) => {
          this.error.set(
            error instanceof InvalidTransitApiResponseError
              ? error.message
              : 'Não foi possível carregar as paragens. Tente novamente.',
          );
          this.loading.set(false);
        },
      });
  }

  retry(): void {
    this.loadStops();
  }

  private initializeMap(): void {
    if (this.map) return;
    const container = document.getElementById('stops-map');
    if (!container || !container.clientWidth || !container.clientHeight) return;

    const initialCenter = preservedMapView
      ? [preservedMapView.latitude, preservedMapView.longitude] as [number, number]
      : [INITIAL_MAP_CENTER.latitude, INITIAL_MAP_CENTER.longitude] as [number, number];
    const initialZoom = preservedMapView?.zoom ?? 10;
    this.map = L.map(container, { zoomControl: false }).setView(initialCenter, initialZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.map.on('moveend', () => {
      const center = this.map?.getCenter();
      if (center) {
        this.lastMapCenter = { latitude: center.lat, longitude: center.lng };
        preservedMapView = {
          latitude: center.lat,
          longitude: center.lng,
          zoom: this.map?.getZoom() ?? 10,
        };
      }
    });
    this.map.on('zoomend', () => this.updateVehicleLayerVisibility());
    this.markerLayer = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 54,
      showCoverageOnHover: false,
    });
    if (this.stopsVisible()) this.markerLayer.addTo(this.map);
    this.vehicleLayer = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 54,
      showCoverageOnHover: false,
    });
    this.updateVehicleLayerVisibility();
    this.renderMarkers(this.filteredStops());
    this.startVehicleUpdates();
  }

  setStopsVisible(visible: boolean): void {
    this.stopsVisible.set(visible);
    if (!this.map || !this.markerLayer) return;
    if (visible) this.markerLayer.addTo(this.map);
    else this.map.removeLayer(this.markerLayer);
  }

  setVehiclesVisible(visible: boolean): void {
    this.vehiclesVisible.set(visible);
    this.updateVehicleLayerVisibility();
  }

  private updateVehicleLayerVisibility(): void {
    const map = this.map;
    const vehicleLayer = this.vehicleLayer;
    if (!map || !vehicleLayer) return;
    const shouldShow = this.vehiclesVisible() && map.getZoom() >= VEHICLE_MIN_ZOOM;
    if (shouldShow) vehicleLayer.addTo(map);
    else if (map.hasLayer(vehicleLayer)) map.removeLayer(vehicleLayer);
  }

  ngOnDestroy(): void {
    clearTimeout(this.markerUpdateTimer);
    this.arrivalsRequest?.unsubscribe();
    if (this.mapFocusFrame !== undefined) {
      cancelAnimationFrame(this.mapFocusFrame);
    }
    this.routeSubscription?.unsubscribe();
    this.stopVehicleUpdates();
    this.map?.remove();
  }

  private startVehicleUpdates(): void {
    this.refreshVehiclePositions();
    this.vehicleRefreshTimer = setInterval(
      () => this.refreshVehiclePositions(),
      VEHICLE_REFRESH_INTERVAL,
    );
  }

  private stopVehicleUpdates(): void {
    if (this.vehicleRefreshTimer) clearInterval(this.vehicleRefreshTimer);
    this.vehicleRefreshTimer = undefined;
    this.vehicleRequest?.unsubscribe();
    this.vehicleRequest = undefined;
  }

  private refreshVehiclePositions(): void {
    if (!this.vehicleLayer) return;
    this.vehicleRequest?.unsubscribe();
    this.vehicleRequest = forkJoin(
      this.operatorServices.map(({ id, service }) =>
        service.getVehiclePositions().pipe(
          map((positions) =>
            positions.map((position) => ({
              ...position,
              id: `${id}:${position.id}`,
              operatorId: id,
            })),
          ),
        ),
      ),
    )
      .pipe(map((operatorPositions) => operatorPositions.flat()))
      .subscribe({
        next: (positions) => {
          this.renderVehiclePositions(positions);
          this.vehicleError.set('');
        },
        error: (error: unknown) => {
          this.vehicleError.set(
            error instanceof InvalidTransitApiResponseError
              ? error.message
              : 'Não foi possível atualizar as posições dos veículos.',
          );
        },
      });
  }

  private renderVehiclePositions(positions: VehiclePosition[]): void {
    const vehicleLayer = this.vehicleLayer;
    if (!vehicleLayer) return;
    const activeIds = new Set<string>();
    for (const vehicle of positions) {
      activeIds.add(vehicle.id);
      this.vehiclePositions.set(vehicle.id, vehicle);
      const lineNumber = this.vehicleLineNumber(vehicle);
      const marker = this.vehicleMarkers.get(vehicle.id);
      if (marker) {
        marker.setLatLng([vehicle.latitude, vehicle.longitude]);
        marker.setIcon(this.vehicleIcon(vehicle));
      } else {
        const newMarker = L.marker([vehicle.latitude, vehicle.longitude], {
          icon: this.vehicleIcon(vehicle),
          alt: lineNumber ? `Linha ${lineNumber}` : 'Autocarro',
          zIndexOffset: 1000,
        }).addTo(vehicleLayer);
        this.vehicleMarkers.set(vehicle.id, newMarker);
      }
    }

    for (const [id, marker] of this.vehicleMarkers) {
      if (activeIds.has(id)) continue;
      vehicleLayer.removeLayer(marker);
      this.vehicleMarkers.delete(id);
      this.vehiclePositions.delete(id);
    }
  }

  private formatVehicleLineId(routeId: string): string {
    return this.formatLineId(routeId).replace(/_\d+$/, '');
  }

  private vehicleRouteKey(operatorId: string, routeId: string): string {
    return `${operatorId}:${this.formatLineId(routeId)}`;
  }

  private vehicleIcon(vehicle: VehiclePosition): L.DivIcon {
    const lineNumber = this.vehicleLineNumber(vehicle);
    const style = this.lineStyle(lineNumber);
    const escapedLineNumber = lineNumber.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] ?? character);
    const bearing = vehicle.bearing ?? 0;
    return L.divIcon({
      className: 'vehicle-marker-icon',
      html: `<span class="vehicle-marker">
        <svg class="vehicle-marker-symbol" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="15" style="fill:${style.backgroundColor}" />
          ${lineNumber ? `<text class="vehicle-marker-label" x="24" y="27" text-anchor="middle" style="fill:${style.color}">${escapedLineNumber}</text>` : ''}
          <path
            d="M24 2 18 13l6-3 6 3L24 2Z"
            transform="rotate(${bearing} 24 24)"
            style="fill:#fff;stroke:${style.backgroundColor}"
          />
        </svg>
      </span>`,
      iconSize: [56, 56],
      iconAnchor: [28, 28],
    });
  }

  private vehicleLineNumber(vehicle: VehiclePosition): string {
    const route = vehicle.routeId && vehicle.operatorId
      ? this.vehicleLinesByRoute.get(this.vehicleRouteKey(vehicle.operatorId, vehicle.routeId))
      : undefined;
    if (route) return route.lineNumber;
    return vehicle.routeId ? this.formatVehicleLineId(vehicle.routeId) : '';
  }

  private updateAllVehicleMarkers(): void {
    for (const [id, marker] of this.vehicleMarkers) {
      const vehicle = this.vehiclePositions.get(id);
      if (vehicle) marker.setIcon(this.vehicleIcon(vehicle));
    }
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.visibleStopCount.set(this.stopBatchSize);
    document.querySelector('.stop-list')?.scrollTo({ top: 0 });
  }

  clearSearch(): void {
    this.search.set('');
    this.visibleStopCount.set(this.stopBatchSize);
    document.querySelector('.stop-list')?.scrollTo({ top: 0 });
  }

  loadMoreStops(event: Event): void {
    const list = event.currentTarget as HTMLElement;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 160) return;

    this.visibleStopCount.update((count) =>
      Math.min(count + this.stopBatchSize, this.filteredStops().length),
    );
  }

  centerOnCurrentLocation(): void {
    this.locationError.set('');
    if (!navigator.geolocation) {
      this.locationError.set('A localização não está disponível neste navegador.');
      return;
    }

    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.locating.set(false);
        const { latitude, longitude } = coords;
        this.lastMapCenter = { latitude, longitude };
        this.updateDistanceOrigin({ latitude, longitude, label: 'A sua localização' });
        this.initializeMap();
        if (!this.map) {
          this.locationError.set('O mapa ainda não está disponível.');
          return;
        }

        this.locationMarker?.remove();
        this.locationMarker = L.circleMarker([latitude, longitude], {
          radius: 7,
          color: '#ffffff',
          weight: 3,
          fillColor: '#367fdf',
          fillOpacity: 1,
        }).addTo(this.map);
        this.map.flyTo([latitude, longitude], Math.max(this.map.getZoom(), 15), {
          duration: 0.7,
        });
      },
      (error) => {
        this.locating.set(false);
        this.locationError.set(
          error.code === error.PERMISSION_DENIED
            ? 'Permita o acesso à localização para centrar o mapa.'
            : 'Não foi possível obter a sua localização.',
        );
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  formatDistance(stop: Stop): string {
    const distance = this.distanceToStop(stop, this.distanceOrigin());
    if (!Number.isFinite(distance)) return '—';
    if (distance < 1_000) return `${Math.round(distance)} m`;

    return `${(distance / 1_000).toLocaleString('pt-PT', {
      maximumFractionDigits: 1,
    })} km`;
  }

  setView(view: 'map' | 'list'): void {
    this.applyRouteView(view);
    if (!this.selectedStop()) {
      void this.router.navigate([view]);
    }
  }

  showStop(stop: Stop): void {
    const operatorId = stop.operatorIds?.[0] ?? OPERATOR_CONFIGS[0]?.id;
    if (!operatorId) return;
    void this.router.navigate([operatorId, stop.id]);
  }

  private applyRouteView(view: 'map' | 'list'): void {
    if (this.view() === view) return;
    this.view.set(view);
    if (view === 'list') {
      const center = this.map?.getCenter();
      if (center) this.lastMapCenter = { latitude: center.lat, longitude: center.lng };
      this.stopVehicleUpdates();
      this.map?.remove();
      this.map = undefined;
      this.markerLayer = undefined;
      this.vehicleLayer = undefined;
      this.markers.clear();
      this.vehicleMarkers.clear();
      this.locationMarker = undefined;
      this.requestDistanceOrigin();
      return;
    }

    requestAnimationFrame(() => {
      this.initializeMap();
      this.map?.invalidateSize();
    });
  }

  private distanceToStop(stop: Stop, origin: Coordinates): number {
    if (
      !Number.isFinite(stop.latitude) ||
      !Number.isFinite(stop.longitude) ||
      !Number.isFinite(origin.latitude) ||
      !Number.isFinite(origin.longitude)
    ) {
      return Number.POSITIVE_INFINITY;
    }

    return distanceBetweenCoordinates(
      origin.latitude,
      origin.longitude,
      stop.latitude,
      stop.longitude,
    );
  }

  private updateDistanceOrigin(origin: Coordinates): void {
    this.distanceOrigin.set(origin);
    this.visibleStopCount.set(this.stopBatchSize);
    if (this.view() === 'list') {
      requestAnimationFrame(() => {
        document.querySelector('.stop-list')?.scrollTo({ top: 0 });
      });
    }
  }

  private requestDistanceOrigin(): void {
    this.updateDistanceOrigin({ ...this.lastMapCenter, label: 'Centro do mapa' });
    if (this.locationRequested) return;
    this.locationRequested = true;

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.updateDistanceOrigin({
          latitude: coords.latitude,
          longitude: coords.longitude,
          label: 'A sua localização',
        });
      },
      () => this.updateDistanceOrigin({ ...this.lastMapCenter, label: 'Centro do mapa' }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  private syncSelectedStop(): void {
    if (!this.routeStopId) {
      if (this.selectedStop()) {
        this.arrivalsRequest?.unsubscribe();
        this.selectedStop.set(null);
        this.departures.set([]);
        this.arrivalsLoading.set(false);
        this.arrivalsError.set('');
      }
      return;
    }

    const stop = this.stops().find((item) => item.id === this.routeStopId);
    if (!stop || this.selectedStop()?.id === stop.id) return;
    this.selectStop(stop);
  }

  selectStop(stop: Stop): void {
    this.selectedStop.set(stop);
    this.loadArrivals(stop);
    requestAnimationFrame(() => this.map?.invalidateSize({ pan: false }));
  }

  closeStopPanel(): void {
    if (this.mapFocusFrame !== undefined) {
      cancelAnimationFrame(this.mapFocusFrame);
      this.mapFocusFrame = undefined;
    }
    if (this.map) {
      const center = this.map.getCenter();
      preservedMapView = {
        latitude: center.lat,
        longitude: center.lng,
        zoom: this.map.getZoom(),
      };
    }
    this.arrivalsRequest?.unsubscribe();
    this.selectedStop.set(null);
    this.departures.set([]);
    this.arrivalsLoading.set(false);
    this.arrivalsError.set('');
    void this.router.navigate([this.view()]);
  }

  retryArrivals(): void {
    const stop = this.selectedStop();
    if (stop) this.loadArrivals(stop);
  }

  formatDeparture(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatLineId(lineId?: string): string {
    return lineId?.replace(/^\[[^\]]+\]/, '') || '—';
  }

  lineStyle(lineId?: string): LineStyle {
    return this.lineStyles().get(this.formatLineId(lineId)) ?? DEFAULT_LINE_STYLE;
  }

  isEstimatedArrival(arrival: Arrival, timestamp: number): boolean {
    return arrival.estimated_arrival_unix === timestamp;
  }

  scheduledDepartureTime(arrival: Arrival, timestamp: number): string | null {
    const scheduled = arrival.scheduled_arrival_unix;
    if (!this.isEstimatedArrival(arrival, timestamp) || typeof scheduled !== 'number') {
      return null;
    }

    const scheduledTime = this.formatDeparture(scheduled);
    return scheduledTime === this.formatDeparture(timestamp) ? null : scheduledTime;
  }

  departureAriaLabel(arrival: Arrival, timestamp: number): string {
    const estimated = this.isEstimatedArrival(arrival, timestamp);
    const scheduledTime = this.scheduledDepartureTime(arrival, timestamp);
    return `${estimated ? 'Hora estimada' : 'Hora prevista'} ${this.formatDeparture(timestamp)}` +
      (scheduledTime ? `, horário previsto ${scheduledTime}` : '');
  }

  private loadArrivals(stop: Stop): void {
    this.arrivalsRequest?.unsubscribe();
    this.arrivalsLoading.set(true);
    this.arrivalsError.set('');
    this.departures.set([]);
    const now = Math.floor(Date.now() / 1000);
    this.arrivalsRequest = forkJoin(
      this.operatorServices.map(({ id, service }) =>
        service.getArrivals(stop.id).pipe(
          map((arrivals) =>
            selectUpcomingArrivals(arrivals, now).map((departure) => ({
              ...departure,
              operatorId: id,
            })),
          ),
        ),
      ),
    ).pipe(
      map((operatorDepartures) =>
        operatorDepartures.flat().sort((a, b) => a.timestamp - b.timestamp),
      ),
      switchMap((departures) =>
        forkJoin(
          this.operatorServices.map(({ id, service }) => {
            const operatorDepartures = departures.filter(
              (departure) => departure.operatorId === id,
            );
            const patternIds = [
              ...new Set(
                operatorDepartures
                  .map(({ arrival }) => arrival.pattern_id)
                  .filter((patternId): patternId is string => Boolean(patternId))
                  .map(normalizePatternId),
              ),
            ];
            if (!patternIds.length) return of(operatorDepartures);
            return forkJoin(
              patternIds.map((patternId) => service.getPattern(patternId)),
            ).pipe(
              map((patterns) => {
                const patternsById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
                return operatorDepartures.filter(({ arrival }) => {
                  const patternId = arrival.pattern_id
                    ? normalizePatternId(arrival.pattern_id)
                    : '';
                  const pattern = patternsById.get(patternId);
                  return !pattern || !isTerminatingAtStop(arrival, pattern, stop);
                });
              }),
            );
          }),
        ).pipe(
          map((operatorDepartures) =>
            operatorDepartures
              .flat()
              .sort((a, b) => a.timestamp - b.timestamp)
              .map(({ operatorId: _operatorId, ...departure }) => departure),
          ),
        ),
      ),
    ).subscribe({
      next: (departures) => {
        this.departures.set(departures);
        this.arrivalsLoading.set(false);
      },
      error: () => {
        this.arrivalsLoading.set(false);
        this.arrivalsError.set('Não foi possível carregar as partidas.');
      },
    });
  }

  private renderMarkers(stops: Stop[]): void {
    if (!this.markerLayer) return;

    this.markers.clear();
    const markers = stops
      .filter(
        (stop) =>
          Number.isFinite(stop.latitude) &&
          Number.isFinite(stop.longitude) &&
          Math.abs(stop.latitude) <= 90 &&
          Math.abs(stop.longitude) <= 180,
      )
      .map((stop) => {
        const marker = L.marker([stop.latitude, stop.longitude], {
          icon: L.divIcon({
            className: 'stop-marker',
            html: `<span style="--stop-marker-background: ${getStopMarkerBackground(stop.operatorIds)}"></span>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
          title: stop.name,
        });
        marker.on('click', () => this.showStop(stop));
        this.markers.set(stop.id, marker);
        return marker;
      });

    this.markerLayer.clearLayers();
    this.markerLayer.addLayers(markers);
  }
}
