/* @flow */

import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser, isChrome } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
import platformDirectives from './directives/index'
import platformComponents from './components/index'

// install platform specific utils
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement

// install platform runtime directives & components
extend(Vue.options.directives, platformDirectives) // Vue.options.directives 扩展了platformDirectives
// model和show
extend(Vue.options.components, platformComponents) // 扩展transition,transitionGroup

// install platform patch function
Vue.prototype.__patch__ = inBrowser ? patch : noop // 浏览器环境才有patch,服务端没有dom所以patch是空函数

// public mount method
/**
 * initMixin(Vue)
 * stateMixin(Vue)
 * eventsMixin(Vue)
 * lifecycleMixin(Vue)
 * renderMixin(Vue)
 * initGlobalAPI
 * 都已经初始化好了
 * */
Vue.prototype.$mount = function ( // 在runtime with compiler的时候被重写了，将template编译成了render，再执行。所以正常情况下render是一定存在的
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 由于runtime only 版本的$mount执行到这里就完了，所以不像runtime compiler，还会判断el，所以这里也做了对el的判断
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating) // 返回mountComponent方法的返回值，Component类型的vm
/*  (
      vm: Component,
      el: ?Element,
      hydrating?: boolean
): Component*/
}

// devtools global hook
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue)
      } else if (
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test' &&
        isChrome
      ) {
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
          'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
        `Make sure to turn on production mode when deploying for production.\n` +
        `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

export default Vue
