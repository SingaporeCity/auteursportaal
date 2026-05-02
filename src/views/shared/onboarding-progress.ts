/**
 * Onboarding-progress — visuele 3-stappen indicator boven de profile-tab.
 *
 * Maakt het visueel duidelijk waar de auteur in de flow zit:
 *  ① Profiel invullen → ② Beoordeling Noordhoff → ③ Portaal volledig actief
 *
 * Per status:
 *  - pending_data         → stap 1 actief, 2 + 3 in-toekomst
 *  - pending_admin_review → stap 1 ✓ klaar, 2 actief, 3 in-toekomst
 *  - active               → component wordt niet gerenderd (auteur ziet full-mode)
 *
 * @module views/shared/onboarding-progress
 */

import { t } from '@/lib/i18n';
import type { OnboardingStatus } from '@/types/db';

type StepState = 'done' | 'current' | 'upcoming';

export function buildOnboardingProgress(status: OnboardingStatus): HTMLElement | null {
  if (status === 'active') {
    return null;
  }

  const wrap = document.createElement('div');
  wrap.className = 'onboarding-progress';
  wrap.setAttribute('role', 'list');
  wrap.setAttribute('aria-label', 'Onboarding-voortgang');

  const steps: { label: string; state: StepState }[] = [
    {
      label: t('onboarding.progress_step1_label'),
      state: status === 'pending_data' ? 'current' : 'done',
    },
    {
      label: t('onboarding.progress_step2_label'),
      state: status === 'pending_admin_review' ? 'current' : 'upcoming',
    },
    {
      label: t('onboarding.progress_step3_label'),
      state: 'upcoming',
    },
  ];

  steps.forEach((step, idx) => {
    if (idx > 0) {
      const sep = document.createElement('div');
      sep.className = 'onboarding-progress-sep';
      sep.setAttribute('aria-hidden', 'true');
      wrap.appendChild(sep);
    }
    wrap.appendChild(buildStep(idx + 1, step.label, step.state));
  });

  return wrap;
}

function buildStep(num: number, label: string, state: StepState): HTMLElement {
  const item = document.createElement('div');
  item.className = `onboarding-progress-step onboarding-progress-step-${state}`;
  item.setAttribute('role', 'listitem');
  if (state === 'current') {
    item.setAttribute('aria-current', 'step');
  }

  const marker = document.createElement('div');
  marker.className = 'onboarding-progress-marker';
  if (state === 'done') {
    marker.textContent = '✓';
  } else if (state === 'upcoming') {
    marker.textContent = '🔒';
  } else {
    marker.textContent = String(num);
  }
  item.appendChild(marker);

  const labelEl = document.createElement('span');
  labelEl.className = 'onboarding-progress-label';
  labelEl.textContent = label;
  item.appendChild(labelEl);

  return item;
}
