/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  handleError,
  emptyObject,
  validateProp
} from '../util/index'
// import {patch} from "../../platforms/web/runtime/patch";

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function initLifecycle (vm: Component) { // 在_init的时候执行
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent // parent实际上是activeInstance,也就是当前vue的实例,作为parent
  if (parent && !options.abstract) { // 父子组件的关系中不会包含抽象组件，也就是没有keep-alive这种组件
    // 把当前实例放到符合要求的父组件的children中
    while (parent.$options.abstract && parent.$parent) { // 父组件是abstract并且父组件有父组件，就取父组件的父组件。知道父组件不是abstract为止。
      parent = parent.$parent
    }
    parent.$children.push(vm) // parent的children就会push当前的vm
  }

  vm.$parent = parent // 把当前的子组件实例指向parent
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) { // instance/index
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) { // 首次渲染，把vnode映射成真实的dom。   当数据改变，影响视图变化，也会调用
    //mountComponent中执行
    // updateComponent = () => {
    //   vm._update(vm._render(), hydrating)
    // }
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode // 第一次给_vnode赋值了，所以更新的时候preVonde是有值的
    const prevActiveInstance = activeInstance
    // 会在update的时候把当前的vm赋值给activeInstance
    // 当前vm的实例的vnode在patch，把当前实例当作父vue实例给子组件
    activeInstance = vm // 子组件执行activeInstance的时候 activeInstance就会指向子组件的实例
    vm._vnode = vnode //_vnode是渲染vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) { // prevVnode是更新用的，所以一开始是空
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */) // 第一次执行patch
      // Vue.prototype.__patch__ = inBrowser ? patch : noop 在runtime/index下定义
      // vm.$el 首次传入的是真实的dom
      // 第二个参数是渲染生产的  执行后得到的vm._render() createElement生成的 vnode

      //patch是将真实的dom赋值给$el

    } else { // 更新走这里
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    activeInstance = prevActiveInstance
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) { // 调用渲染watcher的update,强制调用updateComponent，也就是强制渲染一次,也就是再走一遍_update和_render
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy') // 先执行生命周期
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    } // 移除父子关系的建立
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null) // 递归销毁子组件
    // fire destroyed hook
    callHook(vm, 'destroyed') // 销毁后执行destroyed
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

/**
 * 先看有没有render(正常情况下一定有render)，没有就警告
 * 执行beforeMount。(执行$mount的时候,实例上该挂载的，该初始化的基本都完成了)
 *
 * */

export function mountComponent ( // 定义了updateComponent函数
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  vm.$el = el // vm.$el赋值为el
  if (!vm.$options.render) { // 如果没有render，并且template也没有转换成render
    vm.$options.render = createEmptyVNode // 就创建一个空的VNode，并且报警告
    if (process.env.NODE_ENV !== 'production') { // 一般是使用了runtime-Only的版本，但是又使用了template,没有正确的render函数
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  callHook(vm, 'beforeMount') // 发布订阅模式， 组件挂载之前

  let updateComponent // 定义了updateComponent方法
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) { // 如果是开发环境并且配置了config.performance和mark
    // mark 性能埋点，检测性能 todo
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => { // 这个方法是一个渲染watcher 实际上就是执行了一次渲染，除了首次，更新数据都会触发watch，就会执行
      // updateComponent就是vm._update,第一个参数是vm._render()后生成的vm，hydrating csr为false
      vm._update(vm._render(), hydrating) // vm._render()就是吧实例渲染成vnode ，就是将vm转换为vnode的过程
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  new Watcher(vm, updateComponent, noop, { // 渲染watcher
    // 监听当更新的时候先调用before然后执行updateComponent更新，new的时候并没有走before。new的时候也不该走before
    // new的时候会走get，也就是执行了updateComponent方法。也就是执行了render和patch
    before () {
      if (vm._isMounted) { // 如果已经挂载好了(不是第一次)就执行beforeUpdate
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) { // $vnode指向父vnode，例如<hello-world /> 如果没有vnode就说明不是组件，是根vnode就调用mounted
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent ( //在组件的prepatch中执行,组件更新，就需要对子组件更新
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren
  const hasChildren = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    parentVnode.data.scopedSlots || // has new scoped slots
    vm.$scopedSlots !== emptyObject // has old scoped slots
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (hasChildren) { // 如果是slot的情况，会根据新的值重新去计算slot，然后强制更新
    // keep-alive的情况，patchVnode的时候走到组件prepatch的时候走到这里，然后更新slot后强制更新，keepAlive。然后如果命中cacha，就复用缓存中的节点。
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) { // 执行keepAlive组件的activated的时候也会执行子的keepAlive组件的activated。并且确保只执行一次。
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) { // 递归子组件是keepAlive都执行deactivated
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  const handlers = vm.$options[hook] // 获取组件上的要调用的生命周期，是一个数组。
  if (handlers) { // 如果存在就调用
    for (let i = 0, j = handlers.length; i < j; i++) {
      try {
        handlers[i].call(vm)
      } catch (e) {
        handleError(e, vm, `${hook} hook`)
      }
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
