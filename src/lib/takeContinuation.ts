export function shouldOfferTakeContinuation(input: {
  instrumentalMode?: boolean;
  semanticTruncated?: boolean | null;
}): boolean {
  return input.instrumentalMode !== true && input.semanticTruncated === true;
}
