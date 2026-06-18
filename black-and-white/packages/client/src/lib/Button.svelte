<script lang="ts">
  // Shared button. variant covers the three styles repeated across the app;
  // pass extra layout classes (w-full, min-w-[…]) via class — they don't
  // conflict with the variant's color/padding utilities.
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
    primary:
      'px-8 py-3 font-bold bg-btn-primary-bg text-btn-primary-text enabled:hover:opacity-[0.88]',
    ghost:
      'px-6 py-2.5 font-medium bg-transparent border border-btn-ghost-border ' +
      'text-btn-ghost-text hover:border-gold-muted hover:text-felt-text',
    danger: 'px-6 py-2.5 font-bold bg-danger text-white enabled:hover:opacity-[0.88]',
  };
</script>

<button {type} {disabled} class={`${base} ${variants[variant]} ${extra}`} on:click>
  <slot />
</button>
