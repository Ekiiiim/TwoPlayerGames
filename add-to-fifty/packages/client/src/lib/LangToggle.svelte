<script lang="ts">
  // Mounted once per app, so every screen gets the same control in the same
  // spot. The label names the language you'd switch *to*, not the current one.
  import { lang, toggleLang } from "../i18n";
  import Button from "./Button.svelte";
</script>

<div class="fixed right-3 top-3 z-50">
  <Button variant="secondary" on:click={toggleLang}>
    {$lang === "zh" ? "EN" : "中文"}
  </Button>
</div>
