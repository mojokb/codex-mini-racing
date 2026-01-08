export type InputMessage<TPayload = unknown> = {
  type: 'input';
  sequence: number;
  payload: TPayload;
};

export type StateMessage<TState = unknown> = {
  type: 'state';
  payload: TState;
};

export type ClientToServerMessage<TPayload = unknown> = InputMessage<TPayload>;

export type ServerToClientMessage<TState = unknown> = StateMessage<TState>;

export type MultiplayerMessage<TPayload = unknown, TState = unknown> =
  | ClientToServerMessage<TPayload>
  | ServerToClientMessage<TState>;
