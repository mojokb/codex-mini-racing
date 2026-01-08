import type { ConnectionStatus, MultiplayerClient } from '../net/MultiplayerClient';

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: '대기',
  connecting: '연결 중',
  connected: '연결됨',
  failed: '실패',
  'in-game': '게임 중',
};

export class ConnectionPanel {
  private statusText: HTMLSpanElement;

  constructor(private client: MultiplayerClient, defaultUrl: string) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '6px';
    wrapper.style.fontFamily = '"Courier New", monospace';
    wrapper.style.fontSize = '12px';
    wrapper.style.color = '#ffffff';
    wrapper.style.margin = '8px';

    const statusRow = document.createElement('div');
    statusRow.textContent = '상태: ';
    this.statusText = document.createElement('span');
    this.statusText.textContent = STATUS_LABELS.idle;
    statusRow.appendChild(this.statusText);

    const controlRow = document.createElement('div');
    controlRow.style.display = 'flex';
    controlRow.style.gap = '6px';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultUrl;
    input.placeholder = 'ws://localhost:8080';
    input.style.flex = '1';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '연결';

    button.addEventListener('click', () => {
      this.client.connect(input.value.trim());
    });

    controlRow.appendChild(input);
    controlRow.appendChild(button);

    wrapper.appendChild(statusRow);
    wrapper.appendChild(controlRow);

    this.client.onStatus((status) => this.updateStatus(status));

    document.body.appendChild(wrapper);
  }

  private updateStatus(status: ConnectionStatus): void {
    this.statusText.textContent = STATUS_LABELS[status];
  }
}
