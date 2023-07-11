// import hoistNonReactStatic from 'hoist-non-react-statics';
import * as React from 'react';
import {
  MODULE_DEFAULT, CC_CLASS, CC_CUSTOMIZE,
} from '../../support/constant';
import * as util from '../../support/util';
import runtimeHandler from '../../cc-context/runtime-handler';
import * as hf from '../state/handler-factory';
import mapRegistrationInfo from './map-registration-info';
import buildRefCtx from '../ref/build-ref-ctx';
import beforeMount from './before-mount';
import didMount from './did-mount';
import didUpdate from './did-update';
import beforeUnMount from './before-unmount';
import beforeRender from '../ref/before-render';

const { ccClassDisplayName, shallowDiffers, evalState } = util;
const setupErr = info =>
  new Error(`can not defined setup both in register options and class body, --verbose: ${info}`);

export default function register({
  module = MODULE_DEFAULT,
  state = {},
  watchedKeys = '-',
  storedKeys = [],
  setup = null,
  cuDesc = null,
  persistStoredKeys,
  connect = {},
  extra = {},
  staticExtra,
  tag,
  lite,
  isPropsProxy = false,
  renderKeyClasses,
  __checkStartUp = true,
  compareProps = true,
  __calledBy,
} = {}, ccClassKey = '') {
  try {
    const { _module, _ccClassKey, _connect, _watchedKeys } = mapRegistrationInfo(
      module, ccClassKey, renderKeyClasses, CC_CLASS, watchedKeys, connect, __checkStartUp, __calledBy
    );

    return function (ReactClass) {
      if (ReactClass.prototype && ReactClass.prototype.$$attach) {
        throw new Error(`register a cc class is prohibited!`);
      }
      // const isClsPureComponent = ReactClass.prototype.isPureReactComponent;

      const ToBeExtendedClass = isPropsProxy === false ? ReactClass : React.Component;
      const staticSetup = ToBeExtendedClass.$$setup;

      const _CcClass = class CcClass extends ToBeExtendedClass {
        constructor(props, context) {
          super(props, context);
          try {
            const optState = evalState(state);
            const thisState = this.state || {};
            const privState = Object.assign(thisState, optState);

            this.$$attach = this.$$attach.bind(this);

            // props.ccOption
            const params = Object.assign({}, props, {
              module: _module, tag, state: privState, type: CC_CLASS, insType: CC_CUSTOMIZE,
              watchedKeys: _watchedKeys, ccClassKey: _ccClassKey, connect: _connect, storedKeys,
              persistStoredKeys, extra, staticExtra,
            });
            buildRefCtx(this, params, lite);
            this.ctx.reactSetState = hf.makeRefSetState(this);
            this.ctx.reactForceUpdate = hf.makeRefForceUpdate(this);

            if (setup && (this.$$setup || staticSetup)) {
              throw setupErr(`ccUniqueKey ${this.ctx.ccUniqueKey}`);
            }

            if (!isPropsProxy) {
              if (this.$$setup) this.$$setup = this.$$setup.bind(this);
              beforeMount(this, setup || this.$$setup || staticSetup, false, cuDesc);
            }
            // isPropsProxy为true时，延迟到$$attach里执行beforeMount
          } catch (err) {
            runtimeHandler.tryHandleError(err);
          }
        }

        // 如果代理组件或者继承组件没有没有实现scu，则同时比较nextState nextProps
        // 因为nextProps不同也会导致重渲染，所以需要约束用户不要把可变数据从props传下来，以提高性能
        shouldComponentUpdate(nextProps, nextState) {
          const childRef = this.ctx.childRef;
          if (childRef && childRef.shouldComponentUpdate) {
            return childRef.shouldComponentUpdate(nextProps, nextState);
          } else if (super.shouldComponentUpdate) {
            return super.shouldComponentUpdate(nextProps, nextState);
          }
          const isPropsChanged = compareProps ? shallowDiffers(this.props, nextProps) : false;
          return this.state !== nextState || isPropsChanged;
        }

        //!!! 存在多重装饰器时, 或者用户想使用this.props.***来用concent类时
        //!!! 必需在类的【constructor】 里调用 this.props.$$attach(this),紧接着state定义之后
        $$attach(childRef) {
          const ctx = this.ctx;
          ctx.childRef = childRef;
          childRef.ctx = ctx;// 让代理属性的目标组件访问ctx时，既可以写 this.props.ctx 也可以写 this.ctx

          // 让孩子引用的setState forceUpdate 指向父容器事先构造好的setState forceUpdate
          childRef.setState = ctx.setState;
          childRef.forceUpdate = ctx.forceUpdate;

          if (util.isObjectNotNull(childRef.state)) {
            Object.assign(ctx.state, childRef.state, ctx.__$$mstate);
          }

          if (childRef.$$setup) childRef.$$setup = childRef.$$setup.bind(childRef);
          if (setup && (childRef.$$setup || staticSetup)) throw setupErr(`ccUniqueKey ${ctx.ccUniqueKey}`);
          beforeMount(this, setup || childRef.$$setup || staticSetup, false, cuDesc);

          beforeRender(this);
        }

        componentDidMount() {
          // 属性代理模式，必需在组件consturctor里调用 props.$$attach(this)
          // you must call it in next line of state assign expression 
          if (isPropsProxy && !this.ctx.childRef) {
            throw new Error('forget call props.$$attach(this) in constructor when set isPropsProxy true');
          }

          if (super.componentDidMount) super.componentDidMount();
          didMount(this);
        }

        componentDidUpdate(prevProps, prevState, snapshot) {
          // if (super.componentDidUpdate) super.componentDidUpdate(prevProps, prevState, snapshot);
          // @see https://codesandbox.io/s/example-modular-1-forked-z3xsb?file=/src/App.js
          // prevState 不对，ctx.prevState是正确的 透传给用户
          if (super.componentDidUpdate) super.componentDidUpdate(prevProps, this.ctx.prevState, snapshot);
          didUpdate(this);
        }

        componentWillUnmount() {
          if (super.componentWillUnmount) super.componentWillUnmount();
          beforeUnMount(this);
        }

        // 注：strict mode 模式下，class组件的双调用机制行为和function组件不一样
        // constructor x2 ---> render x2 ---> componentDidMount x1
        // 两次构造器里虽然生成了不同的refCtx，但是两次render里给的 this.ctx 始终是最新的那一个
        // 所以此处不需要像 useConcent 一样做ef标记
        render() {
          const outProps = this.props;
          this.ctx.prevProps = this.ctx.props;
          this.ctx.props = outProps;

          beforeRender(this);
          if (isPropsProxy === false) {
            // now cc class extends ReactClass, call super.render()
            return super.render();
          } else {
            //将$$attach传递下去，用户需在构造器里最后一样调用props.$$attach()
            const passedProps = { ...outProps, ctx: this.ctx, $$attach: this.$$attach };
            return React.createElement(ReactClass, passedProps);
          }
        }
      }

      const displayName = ReactClass.displayName || _ccClassKey;
      _CcClass.displayName = ccClassDisplayName(displayName);
      return _CcClass;
    }
  } catch (err) {
    runtimeHandler.tryHandleError(err);
  }
}
