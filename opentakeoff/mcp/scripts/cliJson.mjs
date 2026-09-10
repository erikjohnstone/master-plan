/** Drain the complete response before exiting despite persistent reader children. */
export async function writeJsonAndExit(value) {
  await new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(value)}\n`, (error) => error ? reject(error) : resolve());
  });
  process.exit(0);
}
