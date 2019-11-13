/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
const componentVNodeHooks = { // 组件默认会有四个钩子
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean { // 在patch的createComponent方法中执行
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ) // 返回子组件的vue实例
      child.$mount(hydrating ? vnode.elm : undefined, hydrating) // 走了mountComponent方法 el为空,然后执行render，并设置子组件了updateComponent的watch
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) { // patch中的createElm时插入insertedVnodeQueue，调用patch的invokeInsertHook时执行 。component组件会在initComponent中插入insertedVnodeQueue
    // 子组件的insert先执行
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true // 设置_isMounted为true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)


/**
 * 先生成一个子组件的构造器Ctor，继承于Vue
 *
 * 安装了基础的组件hook，会merge到组件的hook里
 *
 * 生成一个组件vnode并返回
 * */

export function createComponent ( // _createElement中执行
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component, // 上下文，也就是当前的vm实例 也就相当于vm
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }
  //initGlobalAPI中 Vue.options._base = Vue
  const baseCtor = context.$options._base

  //baseCtor 为 Vue

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) { // 全局组件的Ctor已经是构造器了
    Ctor = baseCtor.extend(Ctor)
  }
  // 如果Ctor是对象，就会调用Vue.extend将Ctor转换为该组件独有的构造器

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') { // 如果不是函数，就警告
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  let asyncFactory // 异步组件
  if (isUndef(Ctor.cid)) { // Ctor是工厂函数
    asyncFactory = Ctor // 异步工厂函数
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor, context) // asyncFactory Vue vm
    if (Ctor === undefined) { // 第一次已经开始加载了，但是还没有拿到结果。 加载成功后，forceUpdate后进来就不为undefined了，就继续下去了，并且Ctor为异步组件的构造器
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  if (isDef(data.model)) { // v-model
    transformModel(Ctor.options, data)
  }

  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  const listeners = data.on // 把listeners指向data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn  // data.on指向data.nativeOn。这也就是为什么组件必须要用.native才能触发原生dom事件

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  installComponentHooks(data) // 安装组件hooks,给组件增加组件必有的hooks，如果组件的hooks里本来就存在，比如本来就存在init这个hooks，那和默认的init // hooks都会执行

  // return a placeholder vnode
  // 生成一个vnode
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )
  // constructor (
  //     tag?: string, `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`
  //     data?: VNodeData, data
  //     children?: ?Array<VNode>, undefined
  //     text?: string, undefined
  //     elm?: Node, undefined
  //     context?: Component, context
  //     componentOptions?: VNodeComponentOptions, { Ctor, propsData, listeners, tag, children }
  //     asyncFactory?: Function asyncFactory
  // )
  // 组件VNode的children是undefined，但是componentOptions里包含了children

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

export function createComponentInstanceForVnode ( // 在component的hook的init方法中执行
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode, // 占位符vnode
    parent // 当前vue 的实例 activeInstance
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  return new vnode.componentOptions.Ctor(options) // 返回了一个子组件的vue实例

  // Ctor 就是createComponent时创建的构造器
  // Ctor = baseCtor.extend(Ctor)
  // 相当于执行了_init(options)
}

function installComponentHooks (data: VNodeData) { // 在createComponent中执行
  const hooks = data.hook || (data.hook = {}) // 把init prepatch insert destroy merge到hooks上
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i] // init prepatch insert destroy
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  // 如果已经有了某个hook，就两个hook都执行
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.props || (data.props = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  if (isDef(on[event])) {
    on[event] = [data.model.callback].concat(on[event])
  } else {
    on[event] = data.model.callback
  }
}
