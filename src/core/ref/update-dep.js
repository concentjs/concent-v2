/** @typedef {import('../../types-inner').IRefCtx} IRefCtx */
import { START } from '../../support/priv-constant';
import { moduleName2stateKeys } from '../../cc-context/internal-vars';
import { mapInsM, makeWaKey } from '../../cc-context/wakey-ukey-map';

//  before render
//  cur: {} compare: {a:2, b:2, c:2} compareCount=3 nextCompare:{}
//
//  receive cur in rendering period as below
//  cur: {a:'val', c:'val', d:'val'}
//
//  after render
//  cur: {a:1, c:1, d:1} compare: {a:1, b:2, c:1, d:1} compareCount=4 nextCompare:{a:2, c:2, d:2}
//
//  then concent know 'b' should delete from dep because its value is 2, 
//  if compare key count become bigger than previous render(4>3) or compare key values include 2, 
//  then cache will be expired
//
//  before next render, assign nextCompare to compare, clear cur and nextCompare
//  cur: {} compare: {a:2, c:2, d:2} compareCount=3 nextCompare:{}

export default function (ref, module, key, isForModule) {
  // 这个key不是模块的stateKey，则忽略依赖记录
  if (!moduleName2stateKeys[module].includes(key)) {
    return;
  }
  /** @type IRefCtx */
  const refCtx = ref.ctx;
  if (
    refCtx.__$$inBM === true // 还处于beforeMount步骤
    || refCtx.__$$renderStatus === START
  ) {
    const ccUniqueKey = refCtx.ccUniqueKey;
    const waKey = makeWaKey(module, key);
    // 未挂载时，是refWatch 或者 refComputed 函数里读取了moduleComputed的值间接推导出来的依赖stateKey
    // 则写到static块里，防止依赖丢失
    if (refCtx.__$$inBM === true) {
      refCtx.__$$staticWaKeys[waKey] = 1;
      return;
    }

    if (!isForModule) {// for ref connect
      // 处于非自动收集状态则忽略，依赖在buildRefCtx时已记录
      if (refCtx.connect[module] !== '-') return;

      const {
        __$$curConnWaKeys,
        __$$compareConnWaKeys,
        __$$nextCompareConnWaKeys,
        __$$nextCompareConnWaKeyCount,
      } = refCtx;

      // TODO: 考虑用 waKey 写在map里
      mapInsM(waKey, ccUniqueKey);
      __$$curConnWaKeys[module][key] = 1;
      __$$compareConnWaKeys[module][key] = 1;
      const tmpMap = __$$nextCompareConnWaKeys[module];
      if (!tmpMap[key]) {
        tmpMap[key] = 2;
        __$$nextCompareConnWaKeyCount[module]++;
      }
    } else {// for ref module
      // 处于非自动收集状态则忽略
      if (refCtx.watchedKeys !== '-') return;

      const {
        __$$curWaKeys,
        __$$compareWaKeys,
        __$$nextCompareWaKeys,
      } = refCtx;

      mapInsM(waKey, ccUniqueKey);
      __$$curWaKeys[key] = 1;
      __$$compareWaKeys[key] = 1;
      if (!__$$nextCompareWaKeys[key]) {
        __$$nextCompareWaKeys[key] = 2;
        refCtx.__$$nextCompareWaKeyCount++;
      }
    }
  }
}
