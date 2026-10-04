/**
 * Why a PDF cannot be opened, in words an estimator can act on.
 *
 * pdf.js refuses a password-protected file ("No password given"), a damaged,
 * cut-short or renamed file ("Invalid PDF structure.") and an empty one ("The
 * PDF file is empty, i.e. its size is zero bytes."); none of its messages names
 * the file, the cause or the fix. One wording for every surface that opens a
 * plan: the canvas's upload and sheet loads, and the MCP server's load_plan
 * (and the production graph CLI behind the canvas's automatic takeoff).
 */

export type UnreadablePdfKind = "password" | "empty" | "invalid" | "other";

/** The class of a pdf.js open failure, from the exception's name and message. */
export function unreadablePdfKind(error: unknown): UnreadablePdfKind {
  const e = error as { name?: unknown; message?: unknown } | null;
  const name = String(e?.name ?? "");
  const message = String(e?.message ?? error ?? "");
  if (name === "PasswordException" || /\bpassword\b/i.test(message)) return "password";
  if (/\bempty\b|\bzero bytes\b/i.test(message)) return "empty";
  if (name === "InvalidPDFException" || /invalid pdf structure/i.test(message)) return "invalid";
  return "other";
}

/** A sentence naming the file, why it cannot be read and what to do. */
export function unreadablePdfMessage(fileName: string, error: unknown): string {
  const name = String(fileName || "This file");
  switch (unreadablePdfKind(error)) {
    case "password":
      return `${name} is password-protected, so it can't be read. Open it with its password in a PDF viewer, `
        + "save or print a copy without security, and add that copy instead.";
    case "empty":
      return `${name} is empty (0 bytes): its upload or download didn't finish. Get the file again and add it.`;
    case "invalid":
      return `${name} isn't a readable PDF: it is damaged, cut short, or not a PDF at all (another kind of file `
        + "renamed .pdf). Download or export it again, and add the new copy.";
    default: {
      const e = error as { message?: unknown } | null;
      return `${name} couldn't be opened as a PDF (${String(e?.message ?? error ?? "unknown error")}).`;
    }
  }
}
