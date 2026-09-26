// A child process's whole stdout as text, for the eval scripts that run one
// document per child and read its JSON back.
//
// Decoding each pipe read on its own ("out += chunk") breaks any multi-byte
// UTF-8 character that falls across two reads: "°" at a 64 KiB boundary came
// back as two U+FFFD ("HOT WATER LWT [��C]"). Where the boundaries fall
// depends only on the output's length, so the same snapshot came back broken
// the same way every time. One stream decoder for the whole output keeps
// every character whole.

/** Collects `child.stdout` through one UTF-8 decoder; call the returned
 * function after the child closes for the text. */
export function childStdoutText(child) {
  child.stdout.setEncoding("utf8");
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  return () => out;
}
