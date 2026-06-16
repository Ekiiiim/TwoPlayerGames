<script lang="ts">
  import { createRoom, joinRoom, roomCode, status } from "../socket";
  let code = "";
</script>

<div class="lobby-card">
  <h1 class="title">黑与白</h1>
  <p class="subtitle">《游戏的法则IV》Ep.01</p>

  <div class="divider"></div>

  <div class="action-group">
    <button class="btn-primary" on:click={createRoom}>创建房间</button>

    {#if $roomCode}
      <div class="room-code-box">
        <span class="room-label">房间码</span>
        <strong class="room-code">{$roomCode}</strong>
        <span class="room-hint">发给朋友，等待对手加入…</span>
      </div>
    {/if}
  </div>

  <div class="divider"></div>

  <div class="join-group">
    <input
      class="code-input"
      placeholder="输入房间码"
      bind:value={code}
      maxlength="6"
    />
    <button
      class="btn-primary"
      on:click={() => joinRoom(code.trim().toUpperCase())}
      disabled={code.trim().length !== 6}
    >
      加入
    </button>
  </div>

  {#if $status}
    <p class="status-msg">{$status}</p>
  {/if}
</div>

<style>
  .lobby-card {
    background: var(--felt);
    border-radius: 20px;
    padding: 48px 52px;
    max-width: 420px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(217, 178, 91, 0.2);
  }

  .title {
    font-size: 2.2rem;
    font-weight: 800;
    color: var(--gold);
    letter-spacing: 4px;
    margin: 0;
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--gold-muted);
    letter-spacing: 1px;
  }

  .divider {
    width: 100%;
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
  }

  .action-group,
  .join-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .btn-primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
    border: none;
    border-radius: 8px;
    padding: 12px 36px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.5px;
    width: 100%;
    transition: opacity 0.15s;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-primary:not(:disabled):hover {
    opacity: 0.88;
  }

  .room-code-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(217, 178, 91, 0.25);
    border-radius: 10px;
    padding: 14px 28px;
    width: 100%;
  }

  .room-label {
    font-size: 0.75rem;
    color: var(--gold-muted);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .room-code {
    font-size: 2rem;
    font-weight: 800;
    color: var(--gold);
    letter-spacing: 6px;
  }

  .room-hint {
    font-size: 0.78rem;
    color: var(--gold-muted);
    margin-top: 2px;
  }

  .code-input {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--btn-ghost-border);
    border-radius: 8px;
    padding: 12px 16px;
    color: var(--felt-text);
    font-size: 1.1rem;
    letter-spacing: 4px;
    text-align: center;
    text-transform: uppercase;
    width: 100%;
    outline: none;
    font-family: monospace;
    transition: border-color 0.15s;
  }

  .code-input:focus {
    border-color: var(--gold-muted);
  }

  .code-input::placeholder {
    color: rgba(203, 185, 138, 0.4);
    letter-spacing: 1px;
    font-family: inherit;
  }

  .status-msg {
    color: #e57373;
    font-size: 0.85rem;
    text-align: center;
  }
</style>
