# Agent Note: dsh 通过 tsx ESM 钩子源码启动

Status: implemented

[English](2026-07-29-dsh-source-launch-tsx-esm.md) | 中文

> 取代[原生 TypeScript 源码启动](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md)：Node 移除了该决策所依赖的能力�?
## 问题

[已归档的原生源码启动决策](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md)�?`apps/cli/src/bin.ts` �?`node --experimental-transform-types` 下运行，配合一个只做解析的 paths loader，由 Node 负责 TypeScript 转换。Node 26.0.0 移除�?`--experimental-transform-types`（进程以 `bad option` 拒绝�?flag），只保�?strip 模式，�?strip 模式无法接受这个源码图必需的语法：vendor Cordis 中的参数属性（`constructor(private ctx: Context)`）、`vendor/hmr` 中的 `@Inject` 装饰器，以及遍布 `vendor/` �?`packages/workflow` 的运行时 enum/namespace。仓库的 engines 范围（`^22.19.0 || >=24.0.0`）包�?Node 26，因此原生启动链在其上完全无法启动——且没有任何 CI 任务执行过真实启动向量，这一不兼容悄然发布�?
启动延迟同样是问题：off-thread �?`module.register()` 钩子工作线程把每次解析都跨线程序列化（TUI 启动期间�?440ms �?`makeSyncRequest` 等待），而完整的 tsx 默认形态（`--import tsx`）会因其 CJS 钩子放大解析开销而多花约 0.4s�?
## 决策

`dsh` �?TUI、Web 与无头源码启动运�?`node --import tsx/esm`：由 tsx �?ESM-only 钩子同时负责 TypeScript 转换�?tsconfig `paths` 投影。根目录�?`dsh` 脚本直接从仓库根目录使用同一启动方式；产物生成是独立操作，由[源码启动与构建分离决策](../simplification/2026-08-12-separate-source-launch-from-build.zh.md)规定。CJS 钩子保持关闭，因�?CLI（命令行界面）源码图是纯 ESM；实测运行时启动�?TUI banner 耗时�?0.7s，对比完�?tsx 默认形态约 1.1s、已移除的原生链�?0.75s�?
`scripts/tspath-loader.ts` �?`apps/cli/src/tsconfig-paths-loader.ts` 已删除。随之消失的还有�?loader「仅为已声明运行时依赖映�?workspace import」的运行时规则——tsx 无条件应�?`paths` 映射。声明完整性现在仅由静态门禁保障：配置的裸插件�?`verify-cordis-config`，manifest（元数据清单）走 workspace constraints。（该运行时规则确实发现过真实缺陷：`dsh-plan-mode` �?`dsh-tool-jobs` 导入 `@deepseek-ai/dsh-llm` 却只声明�?devDependencies；后已修复。）

node-compat CI 矩阵（Node 22.19 �?26）新�?`dsh-source-launch-smoke`（`apps/cli/tests/source-launch.compat.spec.ts`）：以精确的生产运行时启动向量做 keyless 管道 stdio 启动，断言进程会因 TTY 拒绝而以非零状态退出。未�?Node 对模块钩子或 TypeScript 处理的任何改动都会让该门禁变红，而不是破坏开发者的 `pnpm llmh`�?
## 备选方�?
**�?Node �?5 保留原生链并按版本分叉�?* 拒绝：两套转换语义（amaro �?esbuild）在边缘语法上会分歧，启动器要加版本探测，node-compat 矩阵要覆盖两条路径——为一个已经变动过�?experimental flag 付出沉重维护。而且 amaro 也不支持 `vendor/hmr` 使用�?`@Inject` 装饰器，原生路径本来就无法启动随附的默认 TUI 配置�?
**把源码图改成 erasable-only 以适配 Node 26 strip 模式�?* 拒绝：参数属性与�?namespace 遍布 vendor �?Cordis/cosmokit/loader/schemastery；改写是无界 churn，且每次 vendor sync 都要重做�?
**仓库自有的同线程 loader（`module.registerHooks()` + esbuild �?`@swc/core` 转换）�?* 暂拒：原型实测约 0.45s（esbuild 路径未端到端验证；SWC �?`vendor/hmr` 的装饰器 + namespace 合并上两种装饰器模式都会崩），但这意味着要自行负责转换正确性，以及实现 tsx 已经提供的解析钩子。仅当约 0.3s 的差距成为真实成本时再重新考虑；性能分析证据�?PR 讨论中�?
**Node 26 运行构建产物 `lib/`�?4 保留原生�?* 拒绝：在最�?Node 版本线上失去零构建开发循环，且混淆源码面与产物面�?
## 结果

- 整个 engines 范围（包括未来改变原�?TypeScript 支持�?Node 版本线）只有一个启动向量；冒烟门禁按矩阵行强制执行�?- TypeScript 转换重新委托�?tsx/esbuild，逆转了前一�?Agent Note「证�?Node 原生转换可用」的目标；在 vendor 源码使用不可擦除语法�?Node 不再提供 transform 模式的情况下，该目标不可达�?- 源码启动中的运行时依赖声明强制不复存在；未声明的 workspace import 现在只能通过静态门禁或构建模式的解析失败暴露�?- 运行时启动相比完�?tsx 默认形态快�?0.4s；ACP（Agent Client Protocol）保�?`--import tsx`，因为它的依赖图尚未�?CJS 钩子依赖性做审计，且其启动延迟不在交互路径上�?