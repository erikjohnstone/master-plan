/** Presentation of the existing engineering schema, not a second contract or calculator. */
import { useId } from 'react';
import { z } from 'zod';
import { blankEngineeringValue, editorSchema, engineeringRatingShape, engineeringArrayIndex, engineeringListWindow } from './basEngineeringEditorState.ts';

export const humanEngineering = value => String(value ?? '').replaceAll('_', ' ').replace(/\b(ip|io|dc|ac)\b/gi, s => s.toUpperCase());
export const engineeringValueLabel = value => {
  if (value == null || value === '') return 'Unknown / not entered';
  if (Array.isArray(value)) return `${value.length} entries`;
  if (typeof value === 'object') {
    if ('basis' in value) return engineeringValueLabel(value.value);
    if ('unit' in value) return `${value.value || 'Not entered'} ${value.unit}`;
    return 'Open details';
  }
  return String(value);
};
const roles = { endpoint_id: ['endpoint', 'network_port'], part_id: ['resistive_load'], supply_id: ['power_supply'], pool_id: ['pool'],
  required_pool_id: ['pool'], load_id: ['load'], channel_id: ['channel'], physical_terminal_id: ['terminal'], base_id: ['expansion_base'],
  compatible_base_ids: ['expansion_base'], module_id: ['expansion_module'], segment_id: ['serial_segment'], closet_id: ['ip_closet'], address_domain_id: ['ip_domain'] };

export function EngineeringChoices({ label, choices, ids, onChange, ui = {}, onUi }) {
  const window = engineeringListWindow(choices, ui.search || '', ui.page || 0, ([id, text]) => `${text} ${id}`);
  const selected = new Map(choices);
  return <fieldset className="bas-engineering-field"><legend>{label} · {ids.length} selected</legend>
    <label>Find {label.toLowerCase()}<input value={ui.search || ''} onChange={e => onUi({ search: e.target.value, page: 0 })} /></label>
    <div className="bas-engineering-choices">{window.rows.map(([id, text]) => <label key={id}><input type="checkbox" checked={ids.includes(id)}
      onChange={() => onChange(ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id])} />{text}</label>)}</div>
    <div className="bas-point-controls"><button type="button" disabled={!window.page} onClick={() => onUi({ ...ui, page: window.page - 1 })}>Previous {label.toLowerCase()}</button>
      <span>{window.total} matches · page {window.page + 1} of {window.pages}</span>
      <button type="button" disabled={window.page + 1 >= window.pages} onClick={() => onUi({ ...ui, page: window.page + 1 })}>Next {label.toLowerCase()}</button></div>
    <details><summary>All selected {label.toLowerCase()}</summary>{ids.map(id => <p key={id}>{selected.get(id) || `Unavailable selection · ${id}`}
      <button type="button" onClick={() => onChange(ids.filter(v => v !== id))}>Remove {selected.get(id) || id}</button></p>)}</details>
  </fieldset>;
}

export function EngineeringSources({ ids = [], spans, onChange, onSource, search = '', onSearch = () => {}, readOnly = false, label = 'Drawing references', open, onOpenChange }) {
  const matches = search.trim().length >= 2 ? spans.filter(s => s.text.toLowerCase().includes(search.trim().toLowerCase())) : [];
  return <details className="bas-engineering-sources" open={open} onToggle={e => onOpenChange?.(e.currentTarget.open)}><summary>{label} · {ids.length} selected</summary>
    {!readOnly && <><label>Find drawing text<input value={search} onChange={e => onSearch(e.target.value)} placeholder="At least two characters" /></label>
      <div className="bas-engineering-source-options">{matches.slice(0, 50).map(s => <label key={s.span_id}><input type="checkbox" checked={ids.includes(s.span_id)}
        onChange={() => onChange(ids.includes(s.span_id) ? ids.filter(id => id !== s.span_id) : [...ids, s.span_id])} /><span>{s.text}<small>PDF page {s.page_number}</small></span></label>)}</div>
      {matches.length > 50 && <p>Showing 50 matches. Narrow the search; all selections remain retained.</p>}</>}
    {ids.map((id, i) => { const span = spans.find(s => s.span_id === id); return <div key={id} className="bas-engineering-source"><p>{span?.text || 'Source unavailable'}</p>
      <button type="button" disabled={!span} onClick={() => onSource(span.page_id, span.bbox_px, span.text)}>View source · PDF page {span?.page_number}</button>
      {!readOnly && <><button type="button" onClick={() => onChange(ids.filter(s => s !== id))}>Remove reference {i + 1}</button>
        <button type="button" disabled={!i} onClick={() => { const next = [...ids]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onChange(next); }}>Move reference {i + 1} earlier</button></>}
    </div>; })}
    {!ids.length && <p>No drawing text attached. Explicit inputs remain disclosed decisions.</p>}
  </details>;
}

export default function BasEngineeringFields({ schema: raw, value, onChange, label, field, path = field, context, ui = {}, onUi }) {
  const controlId = useId(), schema = editorSchema(raw);
  const { equipment, scopes, resources, checks, spans, onSource } = context;
  const nested = (child, childValue, change, childLabel, childField, childPath) => <BasEngineeringFields schema={child} value={childValue} onChange={change}
    label={childLabel} field={childField} path={childPath} context={context} ui={ui} onUi={onUi} />;
  if (schema instanceof z.ZodNullable) {
    const inner = editorSchema(schema.unwrap()), known = value !== null && value !== undefined;
    const rating = engineeringRatingShape(inner);
    return <fieldset className="bas-engineering-field"><legend>{label}</legend>
      <label htmlFor={controlId}>Information available<select id={controlId} aria-label={`${label}: information available`} value={known ? 'known' : 'unknown'}
        onChange={e => onChange(e.target.value === 'unknown' ? null : rating ? { value: blankEngineeringValue(inner.shape.value),
          basis: { origin: 'explicit_input', source_span_ids: [], original_text: null, reason: '' } } : blankEngineeringValue(inner))}>
        <option value="unknown">Unknown / not provided</option><option value="known">Enter a declared value</option></select></label>
      {known && nested(inner, value, onChange, label, field, `${path}.declared`)}
    </fieldset>;
  }
  const rating = engineeringRatingShape(schema);
  if (rating) return <fieldset className="bas-engineering-field"><legend>{label}: declared information</legend>
        {nested(rating.shape.value, value.value, v => onChange({ ...value, value: v }), label, field, `${path}.value`)}
        <label>Input basis<select aria-label={`${label}: input basis`} value={value.basis.origin} onChange={e => onChange({ ...value, basis: { ...value.basis, origin: e.target.value } })}>
          <option value="">Choose explicitly</option>
          <option value="explicit_input">Explicit input — not extracted</option><option value="drawing_transcription">Manual transcription of drawing text</option></select></label>
        <label>Reason for this value<textarea aria-label={`${label}: reason`} value={value.basis.reason} onChange={e => onChange({ ...value, basis: { ...value.basis, reason: e.target.value } })} /></label>
        <EngineeringSources ids={value.basis.source_span_ids} spans={spans} onSource={onSource} label={`${label}: source evidence`}
          open={!!ui[`${path}.sourcesOpen`]} onOpenChange={v => onUi({ [`${path}.sourcesOpen`]: v })}
          search={ui[`${path}.search`] || ''} onSearch={v => onUi({ [`${path}.search`]: v })}
          onChange={ids => onChange({ ...value, basis: { ...value.basis, source_span_ids: ids,
            original_text: ids.length ? ids.map(id => spans.find(s => s.span_id === id)?.text || '').join('\n') : null } })} />
        {value.basis.original_text !== null && <details><summary>Original retained wording</summary><p className="bas-engineering-verbatim">{value.basis.original_text}</p></details>}
    </fieldset>;
  if (schema instanceof z.ZodLiteral) return null;
  if (schema instanceof z.ZodObject) return <fieldset className="bas-engineering-field"><legend>{label}</legend>
    {Object.entries(schema.shape).map(([key, child]) => <div key={key}>{nested(child, value?.[key], v => onChange({ ...value, [key]: v }), humanEngineering(key), key, `${path}.${key}`)}</div>)}
  </fieldset>;
  if (schema instanceof z.ZodArray) {
    const values = Array.isArray(value) ? value : [], index = engineeringArrayIndex(ui[path], values.length);
    const move = direction => { const other = index + direction; if (other < 0 || other >= values.length) return;
      const next = [...values]; [next[index], next[other]] = [next[other], next[index]]; onChange(next); onUi({ [path]: other }); };
    return <fieldset className="bas-engineering-field"><legend>{label} · {values.length} entries</legend>
      <div className="bas-point-controls"><button type="button" onClick={() => { onChange([...values, blankEngineeringValue(schema.element)]); onUi({ [path]: values.length }); }}>Add {label.toLowerCase()} entry</button>
        {!!values.length && <><label>Entry number<input aria-label={`${label}: selected entry`} type="number" min="1" max={values.length} step="1" value={index + 1}
          onChange={e => onUi({ [path]: engineeringArrayIndex(Number(e.target.value) - 1, values.length) })} /></label>
          <span>of {values.length}</span>
          <button type="button" onClick={() => onChange(values.filter((_, i) => i !== index))}>Remove entry {index + 1}</button>
          <button type="button" disabled={!index} onClick={() => move(-1)}>Move earlier</button><button type="button" disabled={index === values.length - 1} onClick={() => move(1)}>Move later</button></>}
      </div>
      {!!values.length && nested(schema.element, values[index], v => onChange(values.map((item, i) => i === index ? v : item)), `${label} entry ${index + 1}`, field, `${path}.${index}`)}
    </fieldset>;
  }
  let choices = null;
  if (field === 'equipment_id' || field === 'owner_equipment_id' || field === 'equipment_ids') choices = equipment.map(e => [e.equipment_id, e.tag]);
  else if (field === 'scope_id' || field === 'allowed_scope_ids') choices = scopes.map(s => [s.scope_id, [s.building, s.level, s.system, s.phase].filter(Boolean).join(' · ') || s.scope_id]);
  else if (field === 'power_check_id') choices = checks.filter(c => c.kind === 'power').map(c => [c.check_id, c.reason || c.check_id]);
  else if (roles[field]) choices = resources.filter(r => r.roles.some(role => roles[field].includes(role))).map(r => [r.resource_id, `${r.label} · ${equipment.find(e => e.equipment_id === r.equipment_id)?.tag || 'Unknown equipment'}`]);
  else if (schema instanceof z.ZodEnum) choices = schema.options.map(v => [v, humanEngineering(v)]);
  if (choices) {
    const query = ui[`${path}.choiceSearch`] || '';
    const limited = engineeringListWindow(choices, query, 0, ([id, text]) => `${text} ${id}`);
    const shown = limited.rows.some(([id]) => id === value) ? limited.rows : [...limited.rows, ...choices.filter(([id]) => id === value)];
    return <div>{choices.length > 50 && <><label>Find {label.toLowerCase()}<input value={query} onChange={e => onUi({ [`${path}.choiceSearch`]: e.target.value })} /></label>
      <p>{limited.total} matches. Showing up to 50 plus the retained selection; narrow the search.</p></>}
      <label htmlFor={controlId}>{label}<select id={controlId} aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value)}>
    <option value="">Choose explicitly</option>{value && !choices.some(([id]) => id === value) && <option value={value}>Unavailable selection · {value}</option>}
    {shown.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label></div>;
  }
  if (schema instanceof z.ZodNumber) return <label htmlFor={controlId}>{label}<input id={controlId} aria-label={label} type="number" step="1" value={value ?? ''}
    onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} /></label>;
  if (schema instanceof z.ZodString) return <label htmlFor={controlId}>{label}<input id={controlId} aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value)} /></label>;
  return <p role="alert">This field cannot be edited safely. No value has been substituted.</p>;
}
