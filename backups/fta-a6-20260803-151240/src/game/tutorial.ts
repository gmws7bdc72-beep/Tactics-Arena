export interface TutorialProgress {
  version: number;
  welcomeDismissed: boolean;
  matchComplete: boolean;
  marketComplete: boolean;
}

const TUTORIAL_KEY = "fta_tutorial_progress_v1";
export const TUTORIAL_VERSION = 1;

const DEFAULT_PROGRESS: TutorialProgress = {
  version: TUTORIAL_VERSION,
  welcomeDismissed: false,
  matchComplete: false,
  marketComplete: false,
};

export function loadTutorialProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(TUTORIAL_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    return {
      ...DEFAULT_PROGRESS,
      ...parsed,
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

export function resetTutorialProgress(): TutorialProgress {
  const next = { ...DEFAULT_PROGRESS };
  saveTutorialProgress(next);
  return next;
}
