/* eslint-disable camelcase */
import ccContext from '../../cc-context';
import { ERR } from '../../support/constant'
import * as util from '../../support/util'

const { justWarning, makeError: me, verboseInfo: vbi, styleStr: ss, color: cl, logNormal } = util;
const { runtimeVar, ccUKey2ref } = ccContext;
let ccUKey2insCount = {};

function setCcInstanceRef(ccUniqueKey, ref, delayMs) {
  const setRef = () => {
    ccUKey2ref[ccUniqueKey] = ref;
  }

  if (ccContext.isHotReloadMode()) incCcKeyInsCount(ccUniqueKey);
  
  if (delayMs) {
    setTimeout(setRef, delayMs);
  } else {
    setRef();
  }
}

export function incCcKeyInsCount(ccUniqueKey) {
  util.safeAdd(ccUKey2insCount, ccUniqueKey, 1);
}

export function decCcKeyInsCount(ccUniqueKey) {
  util.safeMinus(ccUKey2insCount, ccUniqueKey, 1);
}

export function getCcKeyInsCount(ccUniqueKey) {
  return ccUKey2insCount[ccUniqueKey] || 0;
}

export function clearCount(){
  ccUKey2insCount = {};
}

export default function (ref) {
  const { ccClassKey, ccKey, ccUniqueKey } = ref.ctx;
  if (runtimeVar.isDebug) {
    logNormal(ss(`register ccKey ${ccUniqueKey} to CC_CONTEXT`), cl());
  }

  const isHot = ccContext.isHotReloadMode();
  if (ccUKey2ref[ccUniqueKey]) {
    const dupErr = () => {
      throw me(ERR.CC_CLASS_INSTANCE_KEY_DUPLICATE, vbi(`ccClass:${ccClassKey},ccKey:${ccKey}`));
    }
    if (isHot) {
      // get existed ins count
      const insCount = getCcKeyInsCount(ccUniqueKey);
      if (insCount > 1) {// now cc can make sure the ccKey duplicate
        dupErr();
      }
      // just warning
      justWarning(`
        found ccKey[${ccKey}] duplicated in hot reload mode, please make sure your ccKey is unique manually,
        ${vbi(`ccClassKey:${ccClassKey} ccKey:${ccKey} ccUniqueKey:${ccUniqueKey}`)}
      `);

      // in webpack hot reload mode, cc works not very well,
      // cc can't set ref immediately, because the ccInstance of ccKey will ummount right now in unmount func, 
      // cc call unsetCcInstanceRef will lost the right ref in CC_CONTEXT.refs
      // so cc set ref later
      setCcInstanceRef(ccUniqueKey, ref, 600);
    } else {
      dupErr();
    }
  } else {
    setCcInstanceRef(ccUniqueKey, ref);
  }
}
