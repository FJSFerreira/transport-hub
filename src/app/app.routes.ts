import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { App } from './app';
import { OPERATOR_CONFIGS } from './operator-config';

function viewMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 1) return null;

  const view = segments[0].path;
  if (view !== 'map' && view !== 'list') return null;

  return {
    consumed: segments,
    posParams: { view: segments[0] },
  };
}

function operatorStopMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length < 1 || segments.length > 2) return null;
  if (!OPERATOR_CONFIGS.some(({ id }) => id === segments[0].path)) return null;

  const posParams: Record<string, UrlSegment> = {
    operator: segments[0],
    operatorId: segments[0],
  };
  if (segments[1]) {
    posParams['stop'] = segments[1];
    posParams['stopId'] = segments[1];
  }
  return { consumed: segments, posParams };
}

const defaultOperator = OPERATOR_CONFIGS[0]?.id;

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'map' },
  { matcher: viewMatcher, component: App },
  { matcher: operatorStopMatcher, component: App },
  { path: '**', redirectTo: 'map' },
];
