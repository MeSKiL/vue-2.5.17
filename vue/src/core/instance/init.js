/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'
import {isDef} from "../util";

let uid = 0

export function initMixin (Vue: Class<Component>) { // instance/index
  Vue.prototype._init = function (options?: Object) { // new Vue的时候会执行，在生成组件实例的时候也会执行，因为组件的构造器继承于Vue
    const vm: Component = this
    // a uid
    vm._uid = uid++ // 定义uid

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    // 合并options
    if (options && options._isComponent) { // 如果是组件的话
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options) // 设置了vm.$options
    } else {
      vm.$options = mergeOptions( // 可以通过$options获取到options
        resolveConstructorOptions(vm.constructor), // 这种情况就是Vue.options，在init中初始化
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm // 如果是生产环境，_renderProxy就是vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate') // 执行生命周期
    initInjections(vm) // resolve injections before data/props

    // data(){return{xxx:xxx}}为啥可以通过this.xxx访问到
    initState(vm)

    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) { // 判断有没有el,组件没有el,组件会走组件的hook中的init方法中的child.$mount
      vm.$mount(vm.$options.el) // 有就挂载上去
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) { // 在组件的_init中执行
  // 组建内部合并options
  const opts = vm.$options = Object.create(vm.constructor.options) // 将vm的constructor的options创建成一个对象赋值给$options
  // doing this because it's faster than dynamic enumeration.

  // options

  // const options: InternalComponentOptions = {
  //   _isComponent: true,
  //   _parentVnode: vnode, // 占位符vnode
  //   parent // 当前vm的实例
  // }
  // const inlineTemplate = vnode.data.inlineTemplate
  // if (isDef(inlineTemplate)) {
  //   options.render = inlineTemplate.render
  //   options.staticRenderFns = inlineTemplate.staticRenderFns
  // }


  const parentVnode = options._parentVnode // 占位符父vnode
  opts.parent = options.parent // 父vm实例 activeInstance
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions // 将父组件实例的componentOptions中的一些属性赋值给opts
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) { // Ctor.super不存在就返回Ctor.options
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  return modified
}

function dedupe (latest, extended, sealed) {
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  if (Array.isArray(latest)) {
    const res = []
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // push original options and not sealed options to exclude duplicated options
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    return res
  } else {
    return latest
  }
}
