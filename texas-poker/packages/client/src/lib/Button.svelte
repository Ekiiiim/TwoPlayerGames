<script lang="ts">
  export let disabled = false;
  export let variant: "primary" | "secondary" | "danger" = "primary";

  $: classes =
    "inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-[8px] border px-5 py-2.5 text-[16px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45 " +
    (variant === "primary"
      ? "border-gold bg-gold text-ink hover:brightness-105"
      : variant === "danger"
        ? "border-danger bg-danger text-white hover:brightness-105"
        : "border-[rgba(217,178,91,0.45)] bg-black/20 text-gold-muted hover:border-gold hover:text-felt-text");
</script>

<button class={classes} {disabled} on:click>
  <slot />
</button>
