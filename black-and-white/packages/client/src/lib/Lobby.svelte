<script lang="ts">
  import { createRoom, joinRoom, roomCode, status } from '../socket';
  let code = '';
</script>

<section>
  <button on:click={createRoom}>创建房间</button>
  {#if $roomCode}
    <p>房间码：<strong>{$roomCode}</strong>（发给朋友加入，等待对手…）</p>
  {/if}
  <div>
    <input placeholder="输入房间码" bind:value={code} maxlength="6" />
    <button on:click={() => joinRoom(code.toUpperCase())} disabled={code.length !== 6}>
      加入
    </button>
  </div>
  {#if $status}<p class="status">{$status}</p>{/if}
</section>

<style>
  .status { color: #b00; }
</style>
