import * as util from '../../support/util';
import { refs, reducer } from '../../cc-context/internal-vars';
import pickOneRef from '../../core/ref/pick-one-ref';

const { makeUniqueCcKey, justWarning } = util;
const resolve = () => Promise.resolve();

export default function (action, payLoadWhenActionIsString, rkOrOptions = '', delay, options = {}) {
  const { ccClassKey, ccKey, throwError = true, refModule = '' } = options;
  if (action === undefined && payLoadWhenActionIsString === undefined) {
    throw new Error(`params type error`);
  }

  let dispatchFn, module = '', fnName = '';
  try {
    if (ccClassKey && ccKey) {
      const uKey = makeUniqueCcKey(ccClassKey, ccKey);
      const targetRef = refs[uKey];
      if (!targetRef) {
        justWarning(`no ref found for ccUniqueKey:${uKey}!`);
        return resolve();
      } else {
        dispatchFn = targetRef.ctx.dispatch;
      }
    } else {
      if (typeof action == 'string') {
        if (action.includes('/')) {
          const [m, name] = action.split('/');
          module = m;
          fnName = name;
        } else {
          fnName = action;
        }
      }

      let ref;
      if (module && module !== '*') {
        try {
          ref = pickOneRef(module);
        } catch (err) {
          // do nothing
        }
      } else if (refModule) {
        ref = pickOneRef(refModule);
      }

      if (!ref) {
        ref = pickOneRef();
      }

      dispatchFn = ref.ctx.dispatch;
    }

    if (module === '*') {
      const fullFnNames = reducer._fnName2fullFnNames[fnName];
      if (!fullFnNames) return;
      const tasks = [];
      fullFnNames.forEach(fullFnName => {
        tasks.push(dispatchFn(fullFnName, payLoadWhenActionIsString, rkOrOptions, delay));
      });
      return Promise.all(tasks);
    } else {
      return dispatchFn(action, payLoadWhenActionIsString, rkOrOptions, delay);
    }
  } catch (err) {
    if (throwError) throw err;
    else {
      justWarning(err.message);
      return resolve();
    }
  }
}
