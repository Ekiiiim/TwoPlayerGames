import preprocess from "svelte-preprocess";

export default {
  preprocess: preprocess(),
  // 这些组件是 Svelte 4 时代的写法:export let + $store 自动订阅。
  // Svelte 5.57 起编译器默认走 runes 模式,而 runes 模式禁止 $ 前缀变量名,
  // 于是 $t / $lang 全部报 illegal variable name。写死 runes: false 而不是
  // 依赖默认值,免得下一个小版本再翻一次。
  compilerOptions: { runes: false },
};
