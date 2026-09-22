/** Small counts as words: a drop has "two pieces", a stock report has "2". */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export function countInWords(n: number): string {
  const w = WORDS[n];
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : String(n);
}
