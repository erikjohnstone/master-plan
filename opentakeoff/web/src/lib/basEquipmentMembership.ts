/** Shared BAS source-expression interpretation. No installed quantities, UI
 * heuristics, drawing extraction changes or legacy quantity reinterpretation. */
export const BAS_MEMBERSHIP_RULE = 'literal_membership_1' as const;
const MAX_MEMBERS = 10_000;
const MAX_TEXT = 16_384;
type Failure = 'empty_expression' | 'unsupported_syntax' | 'invalid_number' |
  'incompatible_range' | 'descending_range' | 'ambiguous_padding' |
  'duplicate_member' | 'excluded_member_not_included' | 'too_many_members';
export type BasMembership = { rule_version: typeof BAS_MEMBERSHIP_RULE; raw: string } & (
  { status: 'resolved'; members: string[]; exclusions: string[]; reason: null } |
  { status: 'unresolved'; members: null; exclusions: null; reason: Failure });
type Tag = { prefix: string; separator: string; digits: string; suffix: string; value: number };
const unresolved = (raw: string, reason: Failure): BasMembership =>
  ({ rule_version: BAS_MEMBERSHIP_RULE, raw, status: 'unresolved', members: null, exclusions: null, reason });

function parseTag(text: string): Tag | null {
  // Numeric-prefix and alphabetic-index formats need separate scoped grammars.
  // Do not consume an arbitrary word or number as an equipment identifier.
  const spaced = text.trim().toUpperCase().replace(/\s*-\s*/g, '-');
  const hyphenated = /^([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)-(\d+)([A-Z]*)$/.exec(spaced);
  const plain = hyphenated ? null : /^([A-Z]+)(\d+)([A-Z]*)$/.exec(spaced);
  const match = hyphenated || plain;
  if (!match) return null;
  return { prefix: match[1], separator: hyphenated ? '-' : '', digits: match[2], suffix: match[3], value: Number(match[2]) };
}
const label = (t: Tag, digits = t.digits) => `${t.prefix}${t.separator}${digits}${t.suffix}`;

function parseList(input: string): { values: string[]; reason: null } | { values: null; reason: Failure } {
  const values: string[] = [], seen = new Set<string>();
  const fail = (reason: Failure) => ({ values: null, reason });
  const pieces = input.split(/\s*(?:,|;|&|\bAND\b)\s*/i);
  for (const piece of pieces) {
    if (!piece.trim()) return fail('unsupported_syntax');
    const parts = piece.trim().split(/\s+(?:THRU|THROUGH|TO)\s+/i);
    if (parts.length > 2) return fail('unsupported_syntax');
    const first = parseTag(parts[0]), last = parts.length === 2 ? parseTag(parts[1]) : first;
    if (!first || !last) return fail('unsupported_syntax');
    if (![first.value, last.value].every(n => Number.isSafeInteger(n) && n >= 0)) return fail('invalid_number');
    if (first.prefix !== last.prefix || first.separator !== last.separator || first.suffix !== last.suffix) return fail('incompatible_range');
    if (last.value < first.value) return fail('descending_range');
    const padded = [first.digits, last.digits].some(d => d.length > 1 && d.startsWith('0'));
    if (padded && first.digits.length !== last.digits.length) return fail('ambiguous_padding');
    const size = last.value - first.value + 1;
    if (size > MAX_MEMBERS || values.length + size > MAX_MEMBERS) return fail('too_many_members');
    for (let offset = 0; offset < size; offset++) {
      const digits = parts.length === 1 ? first.digits : String(first.value + offset).padStart(padded ? first.digits.length : 0, '0');
      const member = label(first, digits);
      if (seen.has(member)) return fail('duplicate_member');
      seen.add(member); values.push(member);
    }
  }
  return { values, reason: null };
}

/** An atomic literal expression, not a scan for arbitrary embedded tag mentions.
 * Original text is retained. An unresolved parse must never be counted as zero. */
export function parseBasEquipmentMembership(raw: string): BasMembership {
  if (!raw.trim()) return unresolved(raw, 'empty_expression');
  if (raw.length > MAX_TEXT) return unresolved(raw, 'too_many_members');
  const parts = raw.trim().split(/\s+EXCEPT\s+/i);
  if (parts.length > 2) return unresolved(raw, 'unsupported_syntax');
  const included = parseList(parts[0]);
  if (included.values === null) return unresolved(raw, included.reason);
  const excluded = parts.length === 2 ? parseList(parts[1]) : { values: [], reason: null };
  if (excluded.values === null) return unresolved(raw, excluded.reason!);
  const all = new Set(included.values), subtract = new Set(excluded.values);
  if (excluded.values.some(m => !all.has(m))) return unresolved(raw, 'excluded_member_not_included');
  return { rule_version: BAS_MEMBERSHIP_RULE, raw, status: 'resolved', reason: null,
    members: included.values.filter(m => !subtract.has(m)), exclusions: excluded.values };
}

/** Printed count only. Column/applicability and source ownership are established
 * by the caller's evidence contract, never guessed from this number. */
export function parseBasPrintedCount(raw: string) {
  const text = raw.trim();
  if (!/^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)$/.test(text)) {
    return { raw, status: 'unresolved' as const, value: null, reason: 'not_a_complete_integer' as const };
  }
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isSafeInteger(value)) return { raw, status: 'unresolved' as const, value: null, reason: 'unsafe_integer' as const };
  return { raw, status: 'resolved' as const, value, reason: null };
}
