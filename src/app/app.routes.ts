import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { App } from './app';

function viewMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length < 1 || segments.length > 2) return null;

  const view = segments[0].path;
  if (view !== 'map' && view !== 'list') return null;

  const posParams: Record<string, UrlSegment> = { view: segments[0] };
  if (segments[1]) posParams['stopId'] = segments[1];
  return { consumed: segments, posParams };
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'map' },
  { matcher: viewMatcher, component: App },
  { path: '**', redirectTo: 'map' },
];
