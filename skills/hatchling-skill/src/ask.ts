export async function main(): Promise<void> {
  throw new Error("ask not implemented yet");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
