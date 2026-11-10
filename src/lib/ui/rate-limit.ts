// When too many people (or too many taps) hit a limit, the server answers 429. The person is told so calmly and specifically: this is not
// an error in their work, and nothing was lost. One sentence, used by the server and the screens.
export const RATE_LIMIT_MESSAGE = "Lots of people are trying North right now. Try again in a minute.";
export const LOGIN_RATE_LIMIT_MESSAGE = "Lots of people are trying to log in right now. Try again in a few minutes.";
export const isRateLimitMessage = (s: unknown): boolean => typeof s === "string" && /^Lots of people are trying/.test(s);
