import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) { // 代码清晰明了
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

// new Vue => init => $mount => compile(template) => render => vnode =>(update) patch => dom

// 往vue原型上挂载方法,先挂方法，后init
initMixin(Vue) // 挂了_init
stateMixin(Vue) // 挂了$set $delete $watch
eventsMixin(Vue) // 挂了$on $once $off $emit
lifecycleMixin(Vue) // 挂了_update $forceUpdate $destroy
renderMixin(Vue) // 挂了_render和$nextTick

export default Vue
