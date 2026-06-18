<script lang="ts">
  // 共享按钮。variant 覆盖三种样式;额外布局类(w-full 等)经 class 传入。
  export let variant: 'primary' | 'ghost' | 'danger' = 'primary';
  export let type: 'button' | 'submit' = 'button';
  export let disabled = false;
  let extra = '';
  export { extra as class };

  const base =
    'inline-flex items-center justify-center rounded-[8px] cursor-pointer ' +
    'tracking-[0.5px] whitespace-nowrap transition duration-150 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

  const variants = {
    primary: 'px-8 py-3 font-bold bg-accent text-accent-ink enabled:hover:opacity-[0.88]',
    ghost:
      'px-6 py-2.5 font-medium bg-transparent border border-line ' +
      'text-muted hover:border-accent hover:text-ink',
    danger: 'px-6 py-2.5 font-bold bg-danger text-white enabled:hover:opacity-[0.88]',
  };
</script>

<button {type} {disabled} class={`${base} ${variants[variant]} ${extra}`} on:click>
  <slot />
</button>
