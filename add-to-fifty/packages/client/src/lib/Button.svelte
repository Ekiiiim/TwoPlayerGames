<script lang="ts">
  export let disabled = false;
  export let variant: "primary" | "secondary" | "danger" = "primary";

  $: classes =
    "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[8px] border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 " +
    (variant === "primary"
      ? "border-accent bg-accent text-accent-ink hover:brightness-105"
      : variant === "danger"
        ? "border-danger bg-danger text-white hover:brightness-105"
        : "border-line bg-panel text-ink hover:border-accent");
</script>

<button class={classes} {disabled} on:click>
  <slot />
</button>
