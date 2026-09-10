// Browser persistence metadata, NOT a takeoff field or an approval. A token
// belongs to the exact hydrated editor state, never to a mutable store singleton.
const GENERATION = Symbol.for("opentakeoff.annotation-generation.v1");

export const ANNOTATION_CONFLICT_MESSAGE = "Couldn't save: this project's saved state was replaced after this editor loaded. Your unsaved work is still here; export it before reloading to review the saved version.";

export function annotationGeneration(payload) {
  return payload?.[GENERATION] ?? null;
}

export function attachAnnotationGeneration(payload, generation) {
  if (generation != null && (typeof generation !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(generation))) {
    throw new Error("Couldn't read this project's save version. Saved data was not changed.");
  }
  Object.defineProperty(payload, GENERATION, { value: generation ?? null, enumerable: false });
  return payload;
}

export function annotationConflict() {
  return Object.assign(new Error(ANNOTATION_CONFLICT_MESSAGE), { name: "AnnotationConflictError" });
}

export function isAnnotationConflict(error) {
  return error?.name === "AnnotationConflictError";
}
