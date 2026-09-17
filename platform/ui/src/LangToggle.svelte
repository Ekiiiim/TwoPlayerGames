<script lang="ts">
  // 挂一次,每个界面都在同一个位置。标签写的是「切过去」的那个语言,
  // 不是当前语言。
  //
  // 用 secondary 而不是 ghost:这东西浮在**页面**背景上,不在面板上。
  // add-to-fifty 和 texas-poker 的页面底色(深绿)和面板底色(奶油/绿毡)
  // 是两回事,ghost 的透明底加 text-ui-muted 在页面上读不出来。
  // secondary 自带 bg-ui-surface,四个游戏都读得清。
  import Button from "./Button.svelte";

  export let lang: "en" | "zh";
  export let onToggle: () => void;
</script>

<div class="fixed right-3 top-3 z-50">
  <Button variant="secondary" on:click={onToggle}>
    {lang === "zh" ? "EN" : "中文"}
  </Button>
</div>
