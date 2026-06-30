// Product feature flags. Build-time, public (NEXT_PUBLIC_*) so they tree-shake on
// the client. Flip in the environment to light a feature up without a code change.

/**
 * AI-powered features (e.g. the feedback "AI summary" of written answers). OFF by
 * default — we don't have the model wired yet, so the UI shows the feature as a
 * clearly-labelled, disabled **Beta** until this is set to "true".
 */
export const AI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "true";
