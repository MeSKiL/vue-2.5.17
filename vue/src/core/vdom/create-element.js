/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow

// vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true) // 手写render提供创建vnode方法
// function (createElement) {
//   return createElement('div', {
//     attrs: {
//       id: 'app'
//     },
//   }, this.message)
// }
export function createElement ( // 在initRender中vm.$createElement为createElement方法
  context: Component, // vm
  tag: any, // div
  data: any, // {}
  children: any, // this.message
  normalizationType: any, // true
  alwaysNormalize: boolean
): VNode | Array<VNode> {

  if (Array.isArray(data) || isPrimitive(data)) { // 参数重载，如果data是数组则说明data没传，children是data，就要把之后的参数都往前移
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) { // 如果alwayNormalize是true
    normalizationType = ALWAYS_NORMALIZE // 2
  }
  return _createElement(context, tag, data, children, normalizationType) // 对_createElement的参数处理，做了一层封装
}

// _createElement(context, tag, data, children, normalizationType)
export function _createElement ( // 在createElement中执行
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  if (isDef(data) && isDef((data: any).__ob__)) { // 有__ob__就说明data是响应式的，就报警告
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode() // 返回空的VNode节点 注释节点
  }
  // object syntax in v-bind
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  if (!tag) { // 如果是is节点，并且is不是true，也返回注释节点
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) { // 校验key等，如果不是基础类型就警告
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  // 手写的render 是ALWAYS_NORMALIZE
  if (normalizationType === ALWAYS_NORMALIZE) { // 对children做normalize
    children = normalizeChildren(children) // 手动的不确保是什么数据结构，就normalizeChildren todo
  } else if (normalizationType === SIMPLE_NORMALIZE) { // 自动编译的是SIMPLE_NORMALIZE,所以就调用simpleNormalizeChildren
    children = simpleNormalizeChildren(children)
  }
  let vnode, ns
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    if (config.isReservedTag(tag)) { // 如果是html的保留标签
      // platform built-in elements
      vnode = new VNode(
          // 如果是就创建保留标签
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if (isDef(Ctor = resolveAsset(context.$options, 'components', tag))) { // 没找到就进else
      // 局部组件返回的是一个对象，全局组件返回的是一个构造器
      // component
      // 如果是组件就创建组件
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 如果不认识就创建一个vnode
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
