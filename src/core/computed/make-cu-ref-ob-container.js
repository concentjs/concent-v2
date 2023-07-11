/**
 * 为每一个实例单独建立了一个获取计算结果的观察容器，方便写入依赖
 */
/**@typedef {import('../../types-inner').IRefCtx} ICtx*/
/**@typedef {import('../../types-inner').IRef} IRef*/
import updateDep from '../ref/update-dep';
import computedMap from '../../cc-context/computed-map';
import { CATE_MODULE } from '../../support/constant';
import { justWarning, isAsyncFn, okeys } from '../../support/util';

const hasOwnProperty = Object.prototype.hasOwnProperty;

const { _computedRawValues, _computedValues, _computedRaw, _computedDep } = computedMap;

// refModuleCuDep 来自 ref.ctx.computedDep
function writeRetKeyDep(refModuleCuDep, ref, module, retKey, isForModule) {
  // 所有组件都自动连接到$$global模块，但是未必有对$$global模块的retKey依赖
  const retKey2stateKeys = refModuleCuDep.retKey2stateKeys || {};
  const stateKeys = retKey2stateKeys[retKey] || [];

  
  stateKeys.forEach(stateKey => {
    updateDep(ref, module, stateKey, isForModule);
  });

  // TODO: retKey_otherModStateKeys_  ---> updateDep(ref, module, stateKey, false);
}

/** 
  此函数被以下两种场景调用，
  1 模块首次运行computed&watch时
  2 实例首次运行computed&watch时
  用于生成cuVal透传给计算函数fnCtx.cuVal,
  用户读取cuVal的结果时，收集到当前计算函对其他计算函数的依赖关系
  
    module:
    function fullName(n, o, f){
        return n.firstName + n.lastName;
    }
    
    // 此时funnyName依赖是 firstName lastName age
    function funnyName(n, o, f){
      const { fullName } = f.cuVal;
      return fullName + n.age;
    }
    
    ref:
    ctx.computed('fullName',(n, o, f)=>{
      return n.firstName + n.lastName;
    })
    
    // 此时funnyName依赖是 firstName lastName age
    ctx.computed('funnyName',(n, o, f)=>{
      const { fullName } = f.cuVal;
      return fullName + n.age;
    })
 */
export function getSimpleObContainer(retKey, sourceType, fnType, module, /**@type ICtx*/refCtx, retKeys, referInfo) {
  let oriCuContainer, oriCuObContainer, computedRaw;
  if (CATE_MODULE === sourceType) {
    oriCuContainer = _computedRawValues[module];
    oriCuObContainer = _computedValues[module];
    computedRaw = _computedRaw[module];
  } else {
    oriCuContainer = refCtx.refComputedRawValues;
    oriCuObContainer = refCtx.refComputedValues;
    computedRaw = refCtx.computedRetKeyFns;
  }

  // create cuVal
  return new Proxy(oriCuContainer, {
    get: function (target, otherRetKey) {
      const fnInfo = `${sourceType} ${fnType} retKey[${retKey}]`;
      // 1 防止用户从 cuVal读取不存在的key
      // 2 首次按序执行所有的computed函数时，前面的计算函数取取不到后面的计算结果，收集不到依赖，所以这里强制用户要注意计算函数的书写顺序
      if (hasOwnProperty.call(oriCuContainer, otherRetKey)) {
        if (isAsyncFn(computedRaw[otherRetKey], `${module}/${otherRetKey}`)) {
          referInfo.hasAsyncCuRefer = true;
          // 不允许读取异步计算函数结果做二次计算，隔离一切副作用，确保依赖关系简单和纯粹
          // throw new Error(`${fnInfo},  get an async retKey[${otherRetKey}] from cuVal is not allowed`);
        }

        retKeys.push(otherRetKey);
      } else {
        justWarning(`${fnInfo} get cuVal invalid retKey[${otherRetKey}]`)
      }

      // 从已定义 defineProperty 的计算结果容器里获取结果
      return oriCuObContainer[otherRetKey];
    },
    set: function () {
      return true;
    }
  });
}


/**
 * 创建一个具有依赖收集行为的计算结果获取容器
 * @param {IRef} ref 
 * @param {string} module - 模块名称
 * @param {boolean} isForModule - true: belong to one module, false: connect other modules
 * @param {boolean} isRefCu - 为ref创建
 */
export default function (ref, module, isForModule = true, isRefCu = false) {
  const ctx = ref.ctx;
  const moduleCuRetContainer = _computedValues[module];

  // 注意isRefCu为true时，beforeMount时做了相关的赋值操作，保证了读取ref.ctx下目标属性是安全的
  const oriCuContainer = isRefCu ? ctx.refComputedRawValues : _computedRawValues[module];
  if (!oriCuContainer) return {};

  // refComputed 的 cuRetWrapper 是在setup执行完毕后会被替换成填充满属性的新引用 refComputedValues
  // 见 before-mount里: ctx.refComputedValues =....
  // 所以需要在get时现取，而不能在闭包作用域内提前缓存起来反复使用
  const getCuRetContainer = () => {
    return isRefCu ? ctx.refComputedValues : moduleCuRetContainer;
  };

  // 为普通的计算结果容器建立代理对象
  return new Proxy(oriCuContainer, {
    get: function (target, retKey) {
      // 防止用户从 cuVal读取不存在的key
      if (hasOwnProperty.call(oriCuContainer, retKey)) {
        // 由refComputed.{keyName}取值触发
        if (isRefCu) {
          const computedDep = ref.ctx.computedDep;
          okeys(computedDep).forEach(m => {
            writeRetKeyDep(computedDep[m], ref, m, retKey, isForModule);
          });
        } else {
          // 由moduleComputed.{keyName} 或者 connectedComputed.{moduleName}.{keyName} 取值触发
          writeRetKeyDep(_computedDep[module], ref, module, retKey, isForModule);
        }
      }
      // 从已定义defineProperty的计算结果容器里获取结果
      const cuRetWrapper = getCuRetContainer();
      return cuRetWrapper[retKey];
    },
    set: function (target, retKey, value) {
      target[retKey] = value;
      return true;
    }
  });
}
