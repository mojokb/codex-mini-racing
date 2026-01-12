import type { LobbyState } from '../shared/messages';
import type { MultiplayerClient } from '../net/MultiplayerClient';

type TrackSummary = {
  id: string;
  players?: Array<{ id: string; name: string }>;
  capacity?: number;
  hostId?: string;
};

/**
 * 로비 UI를 렌더링하고 트랙/사용자 목록을 갱신합니다.
 */
export class LobbyPanel {
  private wrapper: HTMLDivElement;
  private userList: HTMLUListElement;
  private trackList: HTMLUListElement;
  private errorText: HTMLDivElement;
  private trackStatusText: HTMLDivElement;
  private startButton: HTMLButtonElement;
  private restartButton: HTMLButtonElement;
  private raceStatusText: HTMLDivElement;
  private sessionId: string | null = null;
  private currentTrack: TrackSummary | null = null;
  private countdownActive = false;
  private raceFinished = false;

  /**
   * LobbyPanel 인스턴스를 생성합니다.
   * @param client 멀티플레이어 클라이언트.
   * @param onScreenChange 화면 전환 콜백.
   */
  constructor(
    private client: MultiplayerClient,
    private onScreenChange?: (screen: 'lobby' | 'track') => void
  ) {
    const wrapper = document.createElement('div');
    this.wrapper = wrapper;
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '8px';
    wrapper.style.fontFamily = '"Courier New", monospace';
    wrapper.style.fontSize = '12px';
    wrapper.style.color = '#ffffff';
    wrapper.style.margin = '8px';

    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';

    const title = document.createElement('strong');
    title.textContent = '로비';

    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.textContent = '트랙 생성';
    createButton.addEventListener('click', () => {
      this.client.sendCreateTrack();
    });

    headerRow.appendChild(title);
    headerRow.appendChild(createButton);

    const trackStatusRow = document.createElement('div');
    trackStatusRow.style.display = 'flex';
    trackStatusRow.style.justifyContent = 'space-between';
    trackStatusRow.style.alignItems = 'center';
    trackStatusRow.style.gap = '8px';
    this.trackStatusText = document.createElement('div');
    this.trackStatusText.textContent = '현재 트랙: -';
    this.startButton = document.createElement('button');
    this.startButton.type = 'button';
    this.startButton.textContent = 'Start';
    this.startButton.hidden = true;
    this.startButton.addEventListener('click', () => {
      this.client.sendStartRace();
    });
    this.restartButton = document.createElement('button');
    this.restartButton.type = 'button';
    this.restartButton.textContent = '재경기';
    this.restartButton.hidden = true;
    this.restartButton.addEventListener('click', () => {
      this.client.sendRestartRace();
    });
    trackStatusRow.appendChild(this.trackStatusText);
    trackStatusRow.appendChild(this.startButton);
    trackStatusRow.appendChild(this.restartButton);

    const userSection = document.createElement('div');
    const userTitle = document.createElement('div');
    userTitle.textContent = '사용자';
    this.userList = document.createElement('ul');
    this.userList.style.margin = '4px 0 0';
    this.userList.style.paddingLeft = '16px';
    userSection.appendChild(userTitle);
    userSection.appendChild(this.userList);

    const trackSection = document.createElement('div');
    const trackTitle = document.createElement('div');
    trackTitle.textContent = '트랙';
    this.trackList = document.createElement('ul');
    this.trackList.style.margin = '4px 0 0';
    this.trackList.style.paddingLeft = '16px';
    trackSection.appendChild(trackTitle);
    trackSection.appendChild(this.trackList);

    this.errorText = document.createElement('div');
    this.errorText.style.color = '#ff8a80';

    this.raceStatusText = document.createElement('div');
    this.raceStatusText.style.color = '#ffe082';

    wrapper.appendChild(headerRow);
    wrapper.appendChild(trackStatusRow);
    wrapper.appendChild(userSection);
    wrapper.appendChild(trackSection);
    wrapper.appendChild(this.raceStatusText);
    wrapper.appendChild(this.errorText);

    document.body.appendChild(wrapper);

    this.client.onLobbyState(this.handleLobbyState);
    this.client.onTrackState(this.handleTrackState);
    this.client.onRaceCountdown(this.handleRaceCountdown);
    this.client.onRaceStarted(this.handleRaceStarted);
    this.client.onRaceFinished(this.handleRaceFinished);
    this.client.onSessionInfo(this.handleSessionInfo);
    this.client.onError(this.handleError);
  }

  /**
   * 로비 패널 표시 여부를 설정합니다.
   * @param isVisible 표시 여부.
   */
  setVisible(isVisible: boolean): void {
    this.wrapper.style.display = isVisible ? 'flex' : 'none';
  }

  /**
   * 로비 상태 업데이트를 처리합니다.
   * @param state 로비 상태 데이터.
   */
  private handleLobbyState = (state: LobbyState<TrackSummary>): void => {
    this.updateUsers(state.users);
    this.updateTracks(state.tracks);
    this.updateCurrentTrackFromLobby(state.tracks);
    this.updateStartButtonState();
  };

  /**
   * 트랙 상태 업데이트를 처리합니다.
   * @param track 트랙 상태 데이터.
   */
  private handleTrackState = (track: TrackSummary): void => {
    this.currentTrack = track;
    this.updateTrackStatus();
    if (this.isSessionInTrack(track)) {
      this.notifyScreenChange('track');
    }
  };

  /**
   * 세션 정보를 처리합니다.
   * @param id 세션 ID.
   */
  private handleSessionInfo = (id: string): void => {
    this.sessionId = id;
    this.updateStartButtonState();
  };

  /**
   * 레이스 카운트다운 이벤트를 처리합니다.
   * @param secondsLeft 남은 초.
   */
  private handleRaceCountdown = (secondsLeft: number): void => {
    this.countdownActive = true;
    this.raceFinished = false;
    this.raceStatusText.textContent = `카운트다운: ${secondsLeft}`;
    this.updateStartButtonState();
  };

  /**
   * 레이스 시작 이벤트를 처리합니다.
   */
  private handleRaceStarted = (): void => {
    this.countdownActive = false;
    this.raceFinished = false;
    this.raceStatusText.textContent = '레이스 시작!';
    this.updateStartButtonState();
  };

  /**
   * 레이스 종료 이벤트를 처리합니다.
   * @param winner 승자 정보.
   */
  private handleRaceFinished = (winner: { id: string; name: string } | null): void => {
    this.countdownActive = false;
    this.raceFinished = true;
    this.raceStatusText.textContent = winner
      ? `레이스 종료 - 승자: ${winner.name}`
      : '레이스 종료';
    this.updateStartButtonState();
  };

  /**
   * 에러 메시지를 표시합니다.
   * @param message 에러 메시지.
   */
  private handleError = (message: string): void => {
    this.errorText.textContent = message;
  };

  /**
   * 사용자 목록을 갱신합니다.
   * @param users 로비 사용자 목록.
   */
  private updateUsers(users: LobbyState<TrackSummary>['users']): void {
    const entries = users.length > 0 ? users : [{ id: '대기 중...', name: '대기 중...' }];
    const fragment = document.createDocumentFragment();
    entries.forEach((user) => {
      const item = document.createElement('li');
      item.textContent = user.name;
      fragment.appendChild(item);
    });
    this.userList.replaceChildren(fragment);
  }

  /**
   * 트랙 목록을 갱신합니다.
   * @param tracks 로비 트랙 목록.
   */
  private updateTracks(tracks: TrackSummary[]): void {
    const fragment = document.createDocumentFragment();
    if (tracks.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = '트랙이 없습니다.';
      fragment.appendChild(empty);
      this.trackList.replaceChildren(fragment);
      return;
    }

    tracks.forEach((track) => {
      const item = document.createElement('li');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '6px';
      const label = document.createElement('span');
      label.textContent = this.formatTrackLabel(track);

      const joinButton = document.createElement('button');
      joinButton.type = 'button';
      joinButton.textContent = '입장';
      joinButton.disabled = this.isTrackFull(track);
      joinButton.addEventListener('click', () => {
        this.client.sendJoinTrack(track.id);
      });

      item.appendChild(label);
      item.appendChild(joinButton);
      fragment.appendChild(item);
    });

    this.trackList.replaceChildren(fragment);
  }

  /**
   * 로비 정보로 현재 트랙 정보를 갱신합니다.
   * @param tracks 로비 트랙 목록.
   */
  private updateCurrentTrackFromLobby(tracks: TrackSummary[]): void {
    if (!this.sessionId) {
      return;
    }
    const activeTrack = tracks.find((track) =>
      track.players?.some((player) => player.id === (this.sessionId ?? '')),
    );
    if (!activeTrack) {
      this.notifyScreenChange('lobby');
      if (this.currentTrack) {
        this.currentTrack = null;
        this.countdownActive = false;
        this.raceFinished = false;
        this.raceStatusText.textContent = '';
        this.updateTrackStatus();
      }
      return;
    }
    if (this.currentTrack?.id !== activeTrack.id) {
      this.currentTrack = activeTrack;
      this.countdownActive = false;
      this.raceFinished = false;
      this.raceStatusText.textContent = '';
      this.updateTrackStatus();
    }
  }

  /**
   * 현재 세션이 트랙에 포함되는지 확인합니다.
   * @param track 트랙 정보.
   * @returns 포함되면 true.
   */
  private isSessionInTrack(track: TrackSummary): boolean {
    if (!this.sessionId) {
      return false;
    }
    return Boolean(track.players?.some((player) => player.id === this.sessionId));
  }

  /**
   * 화면 전환 콜백을 호출합니다.
   * @param screen 화면 상태.
   */
  private notifyScreenChange(screen: 'lobby' | 'track'): void {
    this.onScreenChange?.(screen);
  }

  /**
   * 현재 트랙 표시를 갱신합니다.
   */
  private updateTrackStatus(): void {
    if (!this.currentTrack) {
      this.trackStatusText.textContent = '현재 트랙: -';
      this.startButton.hidden = true;
      return;
    }
    this.trackStatusText.textContent = `현재 트랙: ${this.currentTrack.id}`;
    this.updateStartButtonState();
  }

  /**
   * Start 버튼 표시 여부 및 활성 상태를 갱신합니다.
   */
  private updateStartButtonState(): void {
    const isHost = Boolean(this.currentTrack && this.sessionId && this.currentTrack.hostId === this.sessionId);
    this.startButton.hidden = !isHost || this.raceFinished;
    this.startButton.disabled = !isHost || this.countdownActive;
    this.restartButton.hidden = !isHost || !this.raceFinished;
    this.restartButton.disabled = !isHost || this.countdownActive;
  }

  /**
   * 트랙 라벨 텍스트를 구성합니다.
   * @param track 트랙 정보.
   * @returns 표시할 라벨 문자열.
   */
  private formatTrackLabel(track: TrackSummary): string {
    const playerCount = track.players?.length ?? 0;
    const capacity = typeof track.capacity === 'number' ? track.capacity : null;
    const countText = capacity === null ? `${playerCount}명` : `${playerCount}/${capacity}명`;
    const names = track.players?.map((player) => player.name).join(', ') ?? '';
    const nameText = names ? ` - ${names}` : '';
    return `${track.id} (${countText})${nameText}`;
  }

  /**
   * 트랙이 가득 찼는지 확인합니다.
   * @param track 트랙 정보.
   * @returns 가득 찼으면 true.
   */
  private isTrackFull(track: TrackSummary): boolean {
    if (typeof track.capacity !== 'number') {
      return false;
    }
    const playerCount = track.players?.length ?? 0;
    return playerCount >= track.capacity;
  }
}
