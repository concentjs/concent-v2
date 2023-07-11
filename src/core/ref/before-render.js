/** eslint-disable */
import { START } from '../../support/priv-constant';
import * as util from '../../support/util';

export default function (ref, mapProps) {
  const ctx = ref.ctx;
  ctx.renderCount += 1;

  // 类组件this.reactSetState调用后生成的this.state是一个新的普通对象
  // 每次渲染前替换为ctx.state指向的Proxy对象，确保让类组件里使用this.state能够收集到依赖
  ref.state = ctx.state;
  if (ctx.childRef) ctx.childRef.state = ctx.state;

  // 不处于收集观察依赖 or 已经开始都要跳出此函数
  // strictMode模式下，会走两次beforeRender 一次afterRender，
  // 所以这里严格用ctx.__$$renderStatus === START 来控制只真正执行一次beforeRender
  if (!ctx.__$$autoWatch || ctx.__$$renderStatus === START) {
    return;
  }

  if (ctx.__$$renderStatus !== START) ctx.__$$renderStatus = START;

  if (ctx.__$$hasModuleState) {
    ctx.__$$curWaKeys = {};
    ctx.__$$compareWaKeys = ctx.__$$nextCompareWaKeys;
    ctx.__$$compareWaKeyCount = ctx.__$$nextCompareWaKeyCount;

    // 渲染期间再次收集
    ctx.__$$nextCompareWaKeys = {};
    ctx.__$$nextCompareWaKeyCount = 0;
  }

  const { connectedModules, connect } = ctx;
  connectedModules.forEach(m => {
    // 非自动收集，在make-ob-state里不会触发get，这里直接跳出
    if (connect[m] !== '-') return;

    ctx.__$$curConnWaKeys[m] = {};
    ctx.__$$compareConnWaKeys[m] = ctx.__$$nextCompareConnWaKeys[m];
    ctx.__$$compareConnWaKeyCount[m] = ctx.__$$nextCompareConnWaKeyCount[m];

    // 渲染期间再次收集
    ctx.__$$nextCompareConnWaKeys[m] = {};
    ctx.__$$nextCompareConnWaKeyCount[m] = 0;
  });

  // 外面始终取 ctx.__$$mapped 传给 CcFragment registerHookComp registerDumb 的 render 函数里的 createElement 调用处，
  // 具体 ctx.__$$mapped 指向什么取决于有没有传递 mapProps
  // 传递 mapProps，则传 mapped 给 createElement 函数 props 参数，没传 mapProps，则直接透传 ctx 给 createElement 函数 props 参数
  // !!! 这个规则或许将来某一天会改掉，始终传递 ctx 给 render 函数，这样简单的设定更适合编码思维，而不是存在多种形态
  if (mapProps) {
    const mapped = mapProps(ctx);
    if (util.isPJO(mapped)) {
      Object.assign(ctx.mapped, mapped);
    }
    ctx.__$$mapped = ctx.mapped;
  } else {
    ctx.__$$mapped = ctx;
  }
}
