export interface TutorialProgress {
  version: number;
  welcomeDismissed: boolean;
  matchComplete: boolean;
  marketComplete: boolean;
  /** Set only after the mandatory first-time club naming screen is submitted. */
  teamNameChosen: boolean;
}

const TUTORIAL_KEY = "fta_tutorial_progress_v1";
export const TUTORIAL_VERSION = 1;

const DEFAULT_PROGRESS: TutorialProgress = {
  version: TUTORIAL_VERSION,
  welcomeDismissed: false,
  matchComplete: false,
  marketComplete: false,
  teamNameChosen: false,
};

export function loadTutorialProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(TUTORIAL_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    // Existing careers that completed the old tutorial before the naming step
    // was introduced are grandfathered in instead of being interrupted later.
    const legacyCompletedWithoutNamingField =
      parsed.teamNameChosen === undefined && parsed.marketComplete === true;
    return {
      ...DEFAULT_PROGRESS,
      ...parsed,
      teamNameChosen: legacyCompletedWithoutNamingField
        ? true
        : parsed.teamNameChosen ?? false,
      version: TUTORIAL_VERSION,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveTutorialProgress(progress: TutorialProgress): void {
  localStorage.setItem(TUTORIAL_KEY, JSON.stringify(progress));
}

export function shouldShowTutorialWelcome(): boolean {
  const progress = loadTutorialProgress();
  return !progress.welcomeDismissed && !progress.matchComplete;
}

export function dismissTutorialWelcome(): TutorialProgress {
  const next = { ...loadTutorialProgress(), welcomeDismissed: true };
  saveTutorialProgress(next);
  return next;
}

export function completeMatchTutorial(): TutorialProgress {
  const next = {
    ...loadTutorialProgress(),
    welcomeDismissed: true,
    matchComplete: true,
  };
  saveTutorialProgress(next);
  return next;
}

export function completeMarketTutorial(): TutorialProgress {
  const next = {
    ...loadTutorialProgress(),
    welcomeDismissed: true,
    marketComplete: true,
  };
  saveTutorialProgress(next);
  return next;
}

export function completeTeamNaming(): TutorialProgress {
  const next = {
    ...loadTutorialProgress(),
    welcomeDismissed: true,
    matchComplete: true,
    marketComplete: true,
    teamNameChosen: true,
  };
  saveTutorialProgress(next);
  return next;
}

export function resetTutorialProgress(): TutorialProgress {
  const next = { ...DEFAULT_PROGRESS };
  saveTutorialProgress(next);
  return next;
}
