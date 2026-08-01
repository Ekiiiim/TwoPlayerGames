<script lang="ts">
  export let amount = 0;
  export let compact = false;

  interface ChipDisc {
    value: number;
    face: string;
    edge: string;
    text: string;
  }

  const chipDisc: ChipDisc[] = [
    { value: 100, face: "#15171a", edge: "#f5f3ec", text: "#f5f3ec" },
    { value: 25, face: "#237a57", edge: "#f5f3ec", text: "#f5f3ec" },
    { value: 10, face: "#3d7fd9", edge: "#f5f3ec", text: "#f5f3ec" },
    { value: 5, face: "#d9b25b", edge: "#3a2c08", text: "#3a2c08" },
  ];

  function chipSet(total: number): ChipDisc[] {
    if (total <= 0) return [];
    const result: ChipDisc[] = [];
    let remaining = total;
    for (const chip of chipDisc) {
      if (remaining >= chip.value && result.length < 5) {
        result.push(chip);
        remaining -= chip.value;
      }
    }
    while (remaining > 0 && result.length < 5) {
      result.push(chipDisc[chipDisc.length - 1]);
      remaining -= 5;
    }
    if (result.length === 0) result.push(chipDisc[chipDisc.length - 1]);
    return result;
  }

  $: chips = chipSet(amount);
  $: size = compact ? 30 : 44;
  $: offset = compact ? 16 : 24;
</script>

<div
  class="relative inline-flex items-center"
  style={`width: ${chips.length > 0 ? size + (chips.length - 1) * offset : 0}px; height: ${size}px`}
  aria-label={`${amount} chips`}
>
  {#each chips as chip, i (i)}
    <span
      class="absolute top-0 flex items-center justify-center rounded-full border shadow-[0_3px_7px_rgba(0,0,0,0.32)]"
      style={`left: ${i * offset}px; width: ${size}px; height: ${size}px; color: ${chip.text}; border-color: ${chip.edge}; background:
        radial-gradient(circle at center, ${chip.face} 0 38%, ${chip.edge} 39% 45%, ${chip.face} 46% 63%, ${chip.edge} 64% 69%, ${chip.face} 70% 100%);`}
    >
      <span
        class="absolute inset-[18%] rounded-full border border-current opacity-80"
      ></span>
      <span
        class="text-[0.72rem] font-black leading-none"
        class:text-[0.62rem]={compact}
      >
        {chip.value}
      </span>
    </span>
  {/each}
</div>
