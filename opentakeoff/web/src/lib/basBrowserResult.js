// Surface-specific identity adapter, NOT a math/extraction fork. Reuse the
// existing graph key translation for the NEW BAS evidence payload only.
import { remapGraphSheetKeys } from "./graphKeys.js";

export function basResultForCanvas(compiled, shaToName) {
  if (compiled?.bas_math) remapGraphSheetKeys(compiled.bas_math, shaToName);
  return compiled;
}
