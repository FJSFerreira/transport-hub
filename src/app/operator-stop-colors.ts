import type { OperatorConfig } from './interfaces/operator-config.interface';
import { CmetService } from './services/cmet-service';

export const CMET_OPERATOR_ID = 'carris-metropolitana';
export const CMET_MARKER_COLOR = 'rgb(255, 221, 0)';

export const OPERATOR_CONFIGS: readonly OperatorConfig[] = [
  {
    id: CMET_OPERATOR_ID,
    stopColor: CMET_MARKER_COLOR,
    service: CmetService,
  },
];

export const OPERATOR_STOP_COLORS: Readonly<Record<string, string>> = Object.fromEntries(
  OPERATOR_CONFIGS.map(({ id, stopColor }) => [id, stopColor]),
);

export function getStopMarkerBackground(
  operatorIds: readonly string[] | undefined,
  colors: Readonly<Record<string, string>> = OPERATOR_STOP_COLORS,
): string {
  const operatorColors = [
    ...new Set((operatorIds ?? []).map((operatorId) => colors[operatorId]).filter(Boolean)),
  ];

  if (operatorColors.length === 0) return CMET_MARKER_COLOR;
  if (operatorColors.length === 1) return operatorColors[0];

  const sliceSize = 100 / operatorColors.length;
  const slices = operatorColors.map((color, index) => {
    const start = index * sliceSize;
    return `${color} ${start}% ${start + sliceSize}%`;
  });
  return `conic-gradient(${slices.join(', ')})`;
}
