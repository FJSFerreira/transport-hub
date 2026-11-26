import type { OperatorConfig } from './interfaces/operator-config.interface';
import type { LineStyle } from './interfaces/line-style.interface';
import { CmetService } from './services/cmet-service';
import { CpService } from './services/cp-service';

export const OPERATOR_CONFIGS: readonly OperatorConfig[] = [
  {
    id: 'cmet',
    name: 'Carris Metropolitana',
    stopBackgroundColor: 'rgb(255, 221, 0)',
    stopForegroundColor: 'white',
    service: CmetService,
  },
  {
    id: 'cp',
    name: 'Comboios de Portugal',
    stopBackgroundColor: 'rgb(37, 128, 59)',
    stopForegroundColor: 'white',
    service: CpService,
  },
];

export function getOperatorLineStyle(operatorId: string | undefined): LineStyle | undefined {
  const operator = OPERATOR_CONFIGS.find(({ id }) => id === operatorId);
  return operator
    ? {
        backgroundColor: operator.stopBackgroundColor,
        color: operator.stopForegroundColor,
      }
    : undefined;
}

const operatorStopBackgroundColors: Readonly<Record<string, string>> = Object.fromEntries(
  OPERATOR_CONFIGS.map(({ id, stopBackgroundColor }) => [id, stopBackgroundColor]),
);
const operatorStopForegroundColors: Readonly<Record<string, string>> = Object.fromEntries(
  OPERATOR_CONFIGS.map(({ id, stopForegroundColor }) => [id, stopForegroundColor]),
);

export function getStopMarkerBackground(
  operatorIds: readonly string[] | undefined,
  colors: Readonly<Record<string, string>> = operatorStopBackgroundColors,
): string | undefined {
  const operatorColors = [
    ...new Set(
      (operatorIds ?? [])
        .map((operatorId) => colors[operatorId])
        .filter((color): color is string => Boolean(color)),
    ),
  ];

  if (operatorColors.length === 0) return undefined;
  if (operatorColors.length === 1) return operatorColors[0];

  const sliceSize = 100 / operatorColors.length;
  const slices = operatorColors.map((color, index) => {
    const start = index * sliceSize;
    return `${color} ${start}% ${start + sliceSize}%`;
  });
  return `conic-gradient(${slices.join(', ')})`;
}

export function getStopMarkerForeground(
  operatorIds: readonly string[] | undefined,
  colors: Readonly<Record<string, string>> = operatorStopForegroundColors,
): string | undefined {
  return operatorIds
    ?.map((operatorId) => colors[operatorId])
    .find((color): color is string => Boolean(color));
}
