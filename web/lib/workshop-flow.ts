export type Phase =
  | 'random'
  | 'checksum'
  | 'verify'
  | 'derive'
  | 'recover'
  | 'workbench';
export type InitialIndex = 'A' | 'C';
export type ShareIndex = 'A' | 'C' | 'D';
export type WorkshopFlow = {
  phase: Phase;
  checksumIndex: InitialIndex;
  checksums: Record<InitialIndex, boolean>;
  verified: Record<ShareIndex, boolean>;
  verifyIndex: ShareIndex;
  notice: string;
  navigation: number;
  focus: 'stage' | 'result' | null;
};
export const initialFlow: WorkshopFlow = {
  phase: 'random',
  checksumIndex: 'A',
  checksums: { A: false, C: false },
  verified: { A: false, C: false, D: false },
  verifyIndex: 'A',
  notice: '',
  navigation: 0,
  focus: 'stage',
};

// Keep restored and manually revisited tabs on a worksheet whose prerequisites
// have been completed. Completion flags are rebuilt from checked answers.
export function normalizeWorkshopFlow(
  state: WorkshopFlow,
  derived: boolean,
): WorkshopFlow {
  if (['random', 'checksum', 'workbench'].includes(state.phase)) return state;
  const missing = (['A', 'C'] as const).find(
    (index) => !state.checksums[index] || !state.verified[index],
  );
  if (state.phase === 'verify') {
    const eligible = (index: ShareIndex) =>
      index === 'D' ? !missing && derived : state.checksums[index];
    const index = eligible(state.verifyIndex)
      ? state.verifyIndex
      : (['A', 'C', 'D'] as const).find(eligible);
    if (index) return { ...state, verifyIndex: index };
  }
  if (missing)
    return {
      ...state,
      phase: state.checksums[missing] ? 'verify' : 'checksum',
      checksumIndex: missing,
      verifyIndex: missing,
    };
  if (state.phase === 'recover' && !derived)
    return { ...state, phase: 'derive' };
  if (state.phase === 'recover' && !state.verified.D)
    return { ...state, phase: 'verify', verifyIndex: 'D' };
  return state;
}
export type FlowAction =
  | { type: 'navigate'; phase: Phase; reveal?: boolean }
  | { type: 'select-checksum'; index: InitialIndex }
  | { type: 'session-created' }
  | { type: 'published-example' }
  | { type: 'checksum-completed'; index: InitialIndex }
  | { type: 'select-verification'; index: ShareIndex }
  | { type: 'verification-completed'; index: ShareIndex }
  | { type: 'derivation-completed' }
  | { type: 'recovery-completed' };

// Completion is an explicit user action, never a render effect: revisiting a
// completed page must not immediately send the learner away again.
export function workshopFlow(
  state: WorkshopFlow,
  action: FlowAction,
): WorkshopFlow {
  const navigation = state.navigation + 1;
  switch (action.type) {
    case 'navigate':
      return {
        ...state,
        phase: action.phase,
        notice: '',
        navigation,
        focus: action.reveal ? 'stage' : null,
      };
    case 'select-checksum':
      return {
        ...state,
        phase: 'checksum',
        checksumIndex: action.index,
        notice: '',
        navigation,
        focus: null,
      };
    case 'session-created':
      return {
        ...initialFlow,
        checksums: { A: false, C: false },
        phase: 'checksum',
        notice:
          'Your test backup is ready. First, calculate share A’s checksum.',
        navigation,
      };
    case 'published-example':
      return {
        ...initialFlow,
        phase: 'recover',
        checksums: { A: false, C: false },
        notice: 'The published example is ready to recover.',
        navigation,
      };
    case 'checksum-completed':
      return {
        ...state,
        checksums: { ...state.checksums, [action.index]: true },
        navigation,
        focus: 'stage',
        phase: 'verify',
        verifyIndex: action.index,
        notice: `Share ${action.index}’s checksum is calculated. Recopy the share and verify it on a fresh worksheet.`,
      };
    case 'select-verification':
      return {
        ...state,
        phase: 'verify',
        verifyIndex: action.index,
        notice: '',
        navigation,
        focus: null,
      };
    case 'verification-completed': {
      const verified = { ...state.verified, [action.index]: true };
      const next = (['A', 'C'] as const).find(
        (index) => !state.checksums[index] || !verified[index],
      );
      return {
        ...state,
        verified,
        navigation,
        focus: 'stage',
        phase: next
          ? state.checksums[next]
            ? 'verify'
            : 'checksum'
          : action.index === 'D'
            ? 'recover'
            : 'derive',
        checksumIndex: next ?? state.checksumIndex,
        verifyIndex: next ?? action.index,
        notice: next
          ? `Share ${action.index} is verified. Now ${state.checksums[next] ? 'verify' : 'calculate the checksum for'} share ${next}.`
          : action.index === 'D'
            ? 'Share D is verified. Set A aside and recover the secret with C and D.'
            : 'Both initial shares are verified. Use A and C to make share D.',
      };
    }
    case 'derivation-completed':
      return {
        ...state,
        phase: 'verify',
        verifyIndex: 'D',
        navigation,
        focus: 'stage',
        notice:
          'Share D is calculated. Verify its checksum on a separate worksheet before recovery.',
      };
    case 'recovery-completed':
      return {
        ...state,
        phase: 'recover',
        navigation,
        focus: 'result',
        notice:
          'Secret recovered. Your matching test-wallet addresses are shown below.',
      };
  }
}
