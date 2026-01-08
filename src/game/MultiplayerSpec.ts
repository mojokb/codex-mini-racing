export type MultiplayerModel = 'server-authoritative';

export const MultiplayerSpec = {
  model: 'server-authoritative' as MultiplayerModel,
  tickRateHz: 60,
  tickSeconds: 1 / 60,
  inputSendRateHz: 60,
  inputSendIntervalSeconds: 1 / 60,
  stateSyncRateHz: 20,
  stateSyncIntervalSeconds: 1 / 20,
  inputSequenceRule:
    'Inputs are numbered per tick with an increasing sequence starting at 0. The server uses the latest contiguous sequence to advance simulation.'
};
