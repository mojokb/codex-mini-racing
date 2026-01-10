export type InputMessage<TPayload = unknown> = {
  type: 'input';
  sequence: number;
  payload: TPayload;
};

export type CreateTrackMessage = {
  type: 'track:create';
  payload?: {
    trackId?: string;
  };
};

export type JoinTrackMessage = {
  type: 'track:join';
  payload: {
    trackId: string;
  };
};

export type StateMessage<TState = unknown> = {
  type: 'state';
  payload: TState;
};

export type LobbyState<TTrack = unknown> = {
  users: Array<{ id: string }>;
  tracks: TTrack[];
};

export type LobbyStateMessage<TTrack = unknown> = {
  type: 'lobby:state';
  payload: LobbyState<TTrack>;
};

export type TrackStateMessage<TTrack = unknown> = {
  type: 'track:state';
  payload: TTrack;
};

export type ErrorMessage = {
  type: 'error';
  payload: {
    message: string;
  };
};

export type ClientToServerMessage<TPayload = unknown> =
  | InputMessage<TPayload>
  | CreateTrackMessage
  | JoinTrackMessage;

export type ServerToClientMessage<TState = unknown, TTrack = unknown> =
  | StateMessage<TState>
  | LobbyStateMessage<TTrack>
  | TrackStateMessage<TTrack>
  | ErrorMessage;

export type MultiplayerMessage<TPayload = unknown, TState = unknown> =
  | ClientToServerMessage<TPayload>
  | ServerToClientMessage<TState>;
