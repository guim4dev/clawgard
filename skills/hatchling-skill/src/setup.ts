export async function main(): Promise<void> {
  throw new Error("setup not implemented yet");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
