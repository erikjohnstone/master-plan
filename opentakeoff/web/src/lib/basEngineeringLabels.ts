/** Shared presentation vocabulary; never an engineering rule or calculator. */
import type { BasEngineeringCheck } from './basEngineeringContract.ts';
export const ENGINEERING_LABELS: Record<BasEngineeringCheck['kind'], string> = {
  signal: 'Signal direction & mode', analog_range: 'Analog range & excitation', resistive_loading: 'Electrical loading',
  contact: 'Contact interface & ratings', pulse: 'Pulse timing', power: 'Power supply & loads', mechanical: 'Actuator & mechanical ratings',
  allocation: 'Endpoint & channel allocation', expansion: 'Controller expansion', serial_network: 'Serial network', ip_network: 'IP network & location',
};
