import type { ActivityCoachReview } from "../../../packages/core/src/contracts/activity-review.ts";

/**
 * Home only presents text that already exists on the persisted review.  It
 * deliberately does not summarise or word-clip review text: an apparently
 * harmless omitted condition can reverse the meaning of training advice.
 */
export type HomeReviewPresentation = {
  reviewId: string;
  revision: number;
  headline: string | null;
  assessment: string;
  advice: string | null;
  commentaryWordCount: number;
  isFullPassageFallback: boolean;
  fallbackReason: "over-budget" | "too-many-sentences" | "unpunctuated" | null;
  limitations: string[];
};

const commentaryWordCount = (parts: Array<string | null>) => parts
  .filter((part): part is string => Boolean(part))
  .join(" ")
  .trim()
  .split(/\s+/u)
  .filter(Boolean)
  .length;

// This detects only an explicit sentence terminator. It is never used to cut
// text; uncertainty about the structure selects the full-text fallback.
const sentenceCount = (text: string) => (text.match(/[.!?]+(?:["')\]]|$)/gu) ?? []).length;

const hasExplicitSentenceEnding = (text: string) => /[.!?]+(?:["')\]]|\s*$)/u.test(text);

export function presentHomeReview(review: ActivityCoachReview): HomeReviewPresentation {
  const assessment = review.assessment.trim();
  const assessmentWords = commentaryWordCount([assessment]);
  const assessmentSentences = sentenceCount(assessment);
  const fallbackReason = !hasExplicitSentenceEnding(assessment)
    ? "unpunctuated"
    : assessmentWords > 80
      ? "over-budget"
      : assessmentSentences > 3
        ? "too-many-sentences"
        : null;

  // Long, unpunctuated, or structurally uncertain supplied text is presented
  // in full. The full review remains the detailed source in one activation.
  if (fallbackReason) {
    return {
      reviewId: review.id,
      revision: review.revision,
      headline: null,
      assessment,
      advice: null,
      commentaryWordCount: assessmentWords,
      isFullPassageFallback: true,
      fallbackReason,
      limitations: distinctLimitations(review.limitations),
    };
  }

  let headline: string | null = null;
  let advice: string | null = null;
  let totalWords = assessmentWords;
  let totalSentences = assessmentSentences;
  const candidateHeadline = review.headline.trim();
  const headlineWords = commentaryWordCount([candidateHeadline]);
  const headlineSentences = sentenceCount(candidateHeadline);

  // A headline is useful only when the displayed assessment can sit directly
  // beside it. Otherwise it could be a stronger isolated conclusion.
  if (totalWords + headlineWords <= 80 && totalSentences + headlineSentences <= 3) {
    headline = candidateHeadline;
    totalWords += headlineWords;
    totalSentences += headlineSentences;
  }

  const candidateAdvice = review.nextStep.trim();
  const adviceWords = commentaryWordCount([candidateAdvice]);
  const adviceSentences = sentenceCount(candidateAdvice);
  if (
    hasExplicitSentenceEnding(candidateAdvice)
    && totalWords + adviceWords <= 80
    && totalSentences + adviceSentences <= 3
  ) {
    // Advice is always complete and labeled; a conditional is never clipped.
    advice = candidateAdvice;
    totalWords += adviceWords;
  }

  return {
    reviewId: review.id,
    revision: review.revision,
    headline,
    assessment,
    advice,
    commentaryWordCount: totalWords,
    isFullPassageFallback: false,
    fallbackReason: null,
    limitations: distinctLimitations(review.limitations),
  };
}

function distinctLimitations(limitations: string[]) {
  const seen = new Set<string>();
  return limitations.filter((limitation) => {
    const key = limitation.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
