<script lang="ts">
  // 共享按钮。颜色一律走 ui-* token —— 这个文件里不该出现任何具体颜色。
  // 额外布局类(w-full 等)经 class 传入,不和 variant 的颜色/内距冲突。
  export let variant: "primary" | "secondary" | "ghost" | "danger" = "primary";
  export let type: "button" | "submit" = "button";
  export let disabled = false;
  let extra = "";
  export { extra as class };

  // min-h-[44px] 是 iOS 的最小可点尺寸;四份实现里 add-to-fifty 和
  // texas-poker 有,black-and-white 和 flip-math 没有,统一成有。
  const base =
    "inline-flex min-h-[44px] cursor-pointer items-center justify-center " +
    "rounded-ui-control border px-5 py-2.5 text-sm font-semibold " +
    "whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-45";

  const variants = {
    primary:
      "border-ui-accent bg-ui-accent text-ui-accent-ink hover:brightness-105",
    secondary:
      "border-ui-line bg-ui-surface text-ui-ink hover:border-ui-accent",
    ghost:
      "border-ui-line bg-transparent text-ui-muted hover:border-ui-accent hover:text-ui-ink",
    danger: "border-ui-danger bg-ui-danger text-white hover:brightness-105",
  };
</script>

<button
  {type}
  {disabled}
  class={`${base} ${variants[variant]} ${extra}`}
  on:click
>
  <slot />
</button>
