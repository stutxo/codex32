export type Phase = 'random' | 'checksum' | 'derive' | 'recover' | 'workbench';
export type InitialIndex = 'A' | 'C';
export type WorkshopFlow = {
  phase: Phase;
  checksumIndex: InitialIndex;
  checksums: Record<InitialIndex, boolean>;
  notice: string;
  navigation: number;
  focus: 'stage' | 'result' | null;
};
export const initialFlow: WorkshopFlow = {
  phase: 'random',
  checksumIndex: 'A',
  checksums: { A: false, C: false },
  notice: '',
  navigation: 0,
  focus: 'stage',
};
export type FlowAction =
  | { type: 'navigate'; phase: Phase; reveal?: boolean }
  | { type: 'select-checksum'; index: InitialIndex }
  | { type: 'session-created' }
  | { type: 'published-example' }
  | { type: 'checksum-completed'; index: InitialIndex }
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
    case 'checksum-completed': {
      const checksums = { ...state.checksums, [action.index]: true };
      const next = (['A', 'C'] as const).find((index) => !checksums[index]);
      return {
        ...state,
        checksums,
        navigation,
        focus: 'stage',
        phase: next ? 'checksum' : 'derive',
        checksumIndex: next ?? action.index,
        notice: next
          ? `Share ${action.index}’s checksum is complete. Now calculate share ${next}’s checksum.`
          : 'Both checksums are complete. Use A and C to make share D.',
      };
    }
    case 'derivation-completed':
      return {
        ...state,
        phase: 'recover',
        navigation,
        focus: 'stage',
        notice:
          'Share D is complete. Set A aside and recover the secret with C and D.',
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
