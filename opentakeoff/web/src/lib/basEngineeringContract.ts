/** SHOULD THIS BE ON THE SHARED PATH? Yes: one UI/MCP wire contract.
 * Structure/lineage only. Python validates dimensions, relationships and math.
 * Parsing this does NOT validate source ownership or authorize a saved review.
 */
import { z } from 'zod';
import { canonicalBasJson } from './basCanonical.ts';

const id = z.string().min(1).max(512).regex(/\S/);
const text = z.string().min(1).max(4000).regex(/\S/);
const count = z.number().int().nonnegative().safe(), positive = count.positive();
const names = z.array(id).min(1).max(100);
const mode = z.enum(['voltage', 'current', 'resistance', 'dry_contact', 'relay_contact', 'triac', 'switched_voltage', 'pulse']);
const direction = z.enum(['input', 'output']), waveform = z.enum(['AC', 'DC']);
export const BAS_ENGINEERING_RULE = 'declared_engineering_constraints_1' as const;
export const basEngineeringBasisSchema = z.object({ origin: z.enum(['drawing_transcription', 'explicit_input']),
  source_span_ids: z.array(id).max(200), original_text: text.nullable(), reason: text,
}).strict().superRefine((basis, ctx) => {
  if (new Set(basis.source_span_ids).size !== basis.source_span_ids.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate engineering source span' });
  if (basis.origin === 'drawing_transcription' && (!basis.source_span_ids.length || basis.original_text === null))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Drawing transcription requires source spans and original wording' });
});
const known = <T extends z.ZodTypeAny>(value: T) => z.object({ value, basis: basEngineeringBasisSchema }).strict();
const rating = <T extends z.ZodTypeAny>(value: T) => known(value).nullable();
export const basEngineeringQuantitySchema = z.object({
  value: z.string().max(40).regex(/^-?(0|[1-9][0-9]{0,19})(\.[0-9]{1,18})?$/),
  unit: z.enum(['V', 'mV', 'A', 'mA', 'ohm', 'kohm', 'W', 'kW', 'VA', 'kVA', 'N*m', 'lbf*in', 'lbf*ft',
    'Pa', 'kPa', 'psi', 'degC', 'degF', 'Hz', 'kHz', 's', 'ms', 'ratio']),
}).strict();
const quantity = basEngineeringQuantitySchema;
const interval = z.object({ minimum: quantity, maximum: quantity }).strict();
const endpoint = z.object({ endpoint_id: id, equipment_id: id, scope_id: id }).strict();
const base = { check_id: id, equipment_ids: z.array(id).min(1).max(200), reason: text };
const connection = { ...base, source: endpoint, sink: endpoint };
const contactInterface = z.enum(['dry_relay', 'triac', 'wet_voltage', 'open_collector']);
const demand = z.object({ demand: rating(quantity), power_factor: rating(quantity) }).strict();
const load = z.object({ load_id: id, equipment_id: id, accepted_voltage: rating(interval), accepted_waveform: rating(waveform),
  operating: demand, startup: demand }).strict();
const serialProtocol = z.enum(['bacnet_mstp', 'modbus_rtu']);
const physicalPort = z.enum(['physical_port', 'software_variable']);
const networkPort = { endpoint, physical_kind: rating(physicalPort), media: rating(id) };
const network = { ...base, media: rating(id), allowed_scope_ids: rating(names) };

export const basEngineeringCheckSchema = z.discriminatedUnion('kind', [
  z.object({ ...connection, kind: z.literal('signal'), source_direction: rating(direction), sink_direction: rating(direction),
    source_mode: rating(mode), sink_modes: rating(z.array(mode).min(1).max(8)) }).strict(),
  z.object({ ...connection, kind: z.literal('analog_range'), signal_dimension: z.enum(['voltage', 'current', 'resistance']),
    output_range: rating(interval), accepted_range: rating(interval), output_waveform: rating(waveform),
    accepted_waveform: rating(waveform), excitation: rating(id), accepted_excitation: rating(names) }).strict(),
  z.object({ ...connection, kind: z.literal('resistive_loading'), topology: rating(z.enum(['series', 'parallel', 'effective'])),
    permitted_load: rating(interval), parts: z.array(z.object({ part_id: id, resistance: rating(quantity) }).strict()).min(1).max(1000) }).strict(),
  z.object({ ...connection, kind: z.literal('contact'), provided_interface: rating(contactInterface),
    accepted_interfaces: rating(z.array(contactInterface).min(1).max(4)), circuit_waveform: rating(waveform), rated_waveform: rating(waveform),
    circuit_voltage: rating(interval), rated_voltage: rating(interval), operating_current: rating(quantity), rated_current: rating(interval),
    circuit_load_class: rating(id), rated_load_classes: rating(names) }).strict(),
  z.object({ ...connection, kind: z.literal('pulse'), maximum_frequency: rating(quantity), accepted_maximum_frequency: rating(quantity),
    minimum_on_time: rating(quantity), required_minimum_on_time: rating(quantity), minimum_off_time: rating(quantity),
    required_minimum_off_time: rating(quantity) }).strict(),
  z.object({ ...base, kind: z.literal('power'), supply_id: id, pool_id: id, output_voltage: rating(interval), output_waveform: rating(waveform),
    capacity: rating(quantity), usable_fraction: rating(quantity), loads: z.array(load).min(1).max(1000),
    scenarios: z.array(z.object({ scenario_id: id, reason: text, states: z.array(z.object({ load_id: id,
      state: known(z.enum(['operating', 'startup', 'off'])) }).strict()).min(1).max(1000) }).strict()).max(100) }).strict(),
  z.object({ ...base, kind: z.literal('mechanical'), required_torque: rating(quantity), available_torque: rating(quantity),
    required_closeoff: rating(quantity), available_closeoff: rating(quantity), required_fail_position: rating(id), provided_fail_position: rating(id),
    required_environment: rating(interval), rated_environment: rating(interval), required_enclosure: rating(id), accepted_enclosures: rating(names) }).strict(),
  z.object({ ...base, kind: z.literal('allocation'),
    channels: z.array(z.object({ channel_id: id, physical_terminal_id: id, owner_equipment_id: id, pool_id: rating(id),
      allowed_scope_ids: rating(names), configured_mode: rating(mode), direction: rating(direction) }).strict()).max(10000),
    endpoints: z.array(z.object({ endpoint, physical_kind: rating(z.enum(['physical_io', 'software_variable'])), required_mode: rating(mode),
      required_direction: rating(direction), required_pool_id: rating(id), channel_id: rating(id) }).strict()).min(1).max(10000) }).strict(),
  z.object({ ...base, kind: z.literal('expansion'), base_id: id, pool_id: id, accepted_interfaces: rating(names), maximum_modules: rating(count),
    maximum_channels: rating(count), power_check_id: id.nullable(), modules: z.array(z.object({ module_id: id, equipment_id: id,
      device_kind: rating(z.enum(['expansion', 'standalone_controller'])), interface_id: rating(id), compatible_base_ids: rating(names),
      channel_count: rating(count) }).strict()).min(1).max(1000) }).strict(),
  z.object({ ...network, kind: z.literal('serial_network'), segment_id: id, protocol: rating(serialProtocol), baud_rate: rating(positive),
    frame_format: rating(id), max_devices: rating(positive), max_managers: rating(positive), max_load_microunits: rating(positive),
    max_length_mm: rating(positive), reserved_devices: rating(count), reserved_managers: rating(count), reserved_load_microunits: rating(count),
    reserved_addresses: rating(z.array(count).max(255)), lead_length_mm: rating(count), nodes: z.array(z.object({ ...networkPort,
      protocol: rating(serialProtocol), baud_rate: rating(positive), frame_format: rating(id), role: rating(z.enum(['manager', 'subordinate', 'server'])),
      address: rating(count), load_microunits: rating(count), position_mm: rating(count) }).strict()).min(1).max(1000) }).strict(),
  z.object({ ...network, kind: z.literal('ip_network'), closet_id: id, address_domain_id: id, protocol: rating(id), ports_per_switch: rating(positive),
    reserved_ports_per_switch: rating(count), available_switches: rating(count), max_link_length_mm: rating(positive),
    nodes: z.array(z.object({ ...networkPort, protocol: rating(id), address: rating(id), link_length_mm: rating(count) }).strict()).min(1).max(10000) }).strict(),
]);
export const basEngineeringInputSchema = z.object({ schema_version: z.literal('bas_engineering_input_v1').default('bas_engineering_input_v1'),
  rule_version: z.literal(BAS_ENGINEERING_RULE).default(BAS_ENGINEERING_RULE), checks: z.array(basEngineeringCheckSchema).max(2000) }).strict();
export type BasEngineeringInput = z.infer<typeof basEngineeringInputSchema>;
export type BasEngineeringCheck = z.infer<typeof basEngineeringCheckSchema>;
export type BasEngineeringBasis = z.infer<typeof basEngineeringBasisSchema>;

const status = z.enum(['pass', 'fail', 'not_evaluable']);
const networkStatus = z.enum(['calculated', 'capacity_only', 'infeasible']);
const strings = z.array(z.string());
const evidence = z.object({ sheet_id: z.string().nullable(), table_title: z.string().nullable(), row_key: z.string().nullable(),
  column: z.string().nullable(), text: z.string().nullable(), origin: z.enum(['blueprint_index', 'manual_blueprint_review', 'structured_input']),
  bbox_px: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable() }).strict();
const networkCalculation = z.object({ serial: z.object({ route_id: id, status: networkStatus, unassigned_node_ids: strings,
  segments: z.array(z.object({ node_ids: strings, device_count: count, manager_count: count, load_microunits: count,
    length_mm: count.nullable() }).strict()) }).strict().nullable(),
  ip: z.object({ closet_id: id, status: networkStatus, switches: count.nullable(), endpoint_count: count, spare_ports: count.nullable(),
    overlength_node_ids: strings, unknown_length_node_ids: strings }).strict().nullable(),
  diagnostics: z.array(z.object({ code: z.string(), severity: z.enum(['info', 'warning', 'error']), message: z.string(),
    group_id: z.string().nullable(), point_id: z.string().nullable(), evidence: z.array(evidence) }).strict()),
}).strict();
export const basEngineeringResultSchema = z.object({ schema_version: z.literal('bas_engineering_result_v1'),
  rule_version: z.literal(BAS_ENGINEERING_RULE), original: basEngineeringInputSchema, status,
  project_complete: z.literal(false), coverage: z.literal('selected_declared_constraints_only'),
  checks: z.array(z.object({ check_id: id, kind: z.string(), status, network_calculation: networkCalculation.nullable(),
    constraints: z.array(z.object({ rule_id: z.string().min(1), status, input_paths: strings, missing_inputs: strings,
      message: z.string().min(1), normalized: z.record(z.string()) }).strict()).min(1),
  }).strict()).max(2000),
}).strict();
export type BasEngineeringResult = z.infer<typeof basEngineeringResultSchema>;

/** Response consistency, NOT a second calculator or proof against deliberate
 * re-hashing. Shared Python replay is required before trusting imported results.
 */
export function verifyBasEngineeringResult(input: BasEngineeringInput, raw: unknown): BasEngineeringResult {
  const result = basEngineeringResultSchema.parse(raw);
  if (canonicalBasJson(result.original) !== canonicalBasJson(input)) throw new Error('Engineering response changed its original inputs or evidence');
  if (result.checks.length !== input.checks.length) throw new Error('Engineering response omitted a check');
  const assertStatus = (parent: z.infer<typeof status>, children: z.infer<typeof status>[]) => {
    if (children.includes('fail') ? parent !== 'fail' : !children.length || children.includes('not_evaluable')
      ? parent !== 'not_evaluable' : parent !== 'pass') throw new Error('Engineering response obscured a failed or unresolved constraint');
  };
  for (const [index, checked] of result.checks.entries()) {
    const original = input.checks[index];
    if (checked.check_id !== original.check_id || checked.kind !== original.kind) throw new Error('Engineering response reordered or substituted a check');
    const rules = new Set<string>();
    for (const row of checked.constraints) {
      if (rules.has(row.rule_id)) throw new Error('Engineering response duplicated a constraint');
      rules.add(row.rule_id);
      for (const path of row.input_paths) {
        let cursor: unknown = original;
        for (const part of path.split('.')) {
          if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) throw new Error('Engineering response references an absent input');
          cursor = (cursor as Record<string, unknown>)[part];
        }
      }
      if (row.missing_inputs.some(path => !row.input_paths.includes(path)) || (row.missing_inputs.length && row.status === 'pass'))
        throw new Error('Engineering response obscured missing input evidence');
    }
    if ((original.kind === 'serial_network' || original.kind === 'ip_network') !== (checked.network_calculation !== null))
      throw new Error('Engineering response changed network calculation ownership');
    if (checked.network_calculation) {
      const { serial, ip } = checked.network_calculation;
      if (original.kind === 'serial_network' && (ip !== null || (serial && serial.route_id !== original.segment_id)))
        throw new Error('Engineering response changed the serial segment');
      if (original.kind === 'ip_network' && (serial !== null || (ip && ip.closet_id !== original.closet_id)))
        throw new Error('Engineering response changed the IP closet');
    }
    assertStatus(checked.status, checked.constraints.map(c => c.status));
  }
  assertStatus(result.status, result.checks.map(c => c.status));
  return result;
}
