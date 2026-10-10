// Quiet memory: the learner model shapes explanations but is never announced.
// Replies containing these phrases are sent back to the model once to be rewritten.

const PATTERNS: RegExp[] = [
  /\bas you(?:'ve| have)? (?:already )?(?:learn|learnt|learned|saw|seen|studied|covered|know)\b/i,
  /\bremember (?:when|how|that you)\b/i,
  /\bsince you (?:already )?(?:know|understand|learned|learnt|are comfortable|took|studied)\b/i,
  /\bbased on (?:your|the) (?:profile|history|background|learner model|past)\b/i,
  /\byou(?:'ve| have) (?:shown|demonstrated) (?:that )?you\b/i,
  /\bfrom (?:your|our) (?:earlier|previous|past) (?:session|problem|work)s?\b/i,
  /\bi (?:know|remember|recall) (?:that )?you\b/i,
  /\bgiven (?:your|that you have a) (?:background|strong)\b/i,
];

export function findMemoryPhrase(text: string): string | null {
  for (const p of PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

/** True if the student is asking about their own history, which makes mentioning it fine. */
export function asksAboutHistory(message: string): boolean {
  return /\b(what do you (know|remember) about me|my (history|progress|profile)|what have i (learned|covered|done))\b/i.test(message);
}
