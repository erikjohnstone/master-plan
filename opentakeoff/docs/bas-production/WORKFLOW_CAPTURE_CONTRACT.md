# Durable BAS evidence captures — contract before implementation

Should this be on the shared path? **Yes** for capture identity, validation,
merge, and byte-bound citation resolution. **No** for storage transport, table
layout, filters, and browser navigation. No extraction or engineering change.

This increment connects the existing point interpreter to persistent project
state and a real matrix reader. It is a foundation of workflows A/E, not their
completion or a substitute for equipment/assembly/review implementation.

`bas_workflow_v1` initially stores immutable point-evidence captures with their
complete input document manifests and a current-capture pointer. Each capture
is SHA-256 addressed using canonical JSON (sorted object keys; array order and
original strings/numbers preserved). Navigation aliases are excluded from the
fingerprint; source IDs, page IDs, geometry, values, rule version and diagnostic
statuses are included. No timestamps or UI selection affect identity. Repeated
compile/import is idempotent. Different results remain separate captures.

Import is evidence transport, never approval. Validate structure before mutation;
check fingerprints before use. A valid fingerprint detects corruption, not a
forged author's authority. Source-byte matching permits navigation, not certified
interpretation. No approval is implemented by this record. Failed validation must
preserve the existing saved project rather than silently dropping BAS data.

Project JSON/autosave/snapshots carry the additive field. Old records omit it;
restoring an old record clears current transient results. Merge preserves the
operator's current capture and unions retained captures. Missing or replaced
PDFs do not delete evidence; navigation must resolve the original SHA/page
against currently loaded bytes, never reuse an old filename with new bytes.
The existing project file does not contain every historical source PDF; the
UI/export must disclose that limitation. Immutable source-byte archiving,
revision correspondence and approved snapshots remain required later.

The reader defaults to original digital matrices, with all original columns and
nested header rows. Missing cells differ from explicit blanks; no inferred zero.
Selected-row details expose observations, qualifiers and unresolved conditions.
Point JSON exports preserve the complete record irrespective of UI filters.

Acceptance: real Fort Sam 12 matrices/193 listed rows retained; strict wire and
fingerprint validation; changed text/geometry rejected; aliases/order-independent
document identity; stable repeat capture; non-destructive conflicting imports;
autosave/reload/export/reimport equality; old-file restore clears results;
source navigation succeeds after rename and refuses changed/missing bytes;
no old extraction fields changed; keyboard, dense tables and both themes.
Controlled corruption/revision fixtures must be labeled as such. Full source
retention, all-corpus/holdout and all five final journeys remain open.
