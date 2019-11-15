/* @flow */

import { extend, warn, isObject } from 'core/util/index'

/**
 * Runtime helper for rendering <slot>
 */
export function renderSlot ( // 子组件的时候render的时候执行的，_t会走到这里
  name: string, // slotName
  fallback: ?Array<VNode>, // children
  props: ?Object,
  bindObject: ?Object
): ?Array<VNode> {
  const scopedSlotFn = this.$scopedSlots[name]  // 父占位符创建的时候新建的,通过_u
  // 实际上this.$scopedSlots是key对应fn的对象
  let nodes
  if (scopedSlotFn) { // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        )
      }
      props = extend(extend({}, bindObject), props)
    } // 子组件通过函数调用的方式创建nodes，将父组件的children保留下来，延迟到子组件render的时候取生成。随意也就可以访问到props的内容
    // scoped下的children，会在子组件render的时候创建，所以环境是子组件的环境
    nodes = scopedSlotFn(props) || fallback // 执行以后就返回 一个对象 key对应fn
  } else {
    const slotNodes = this.$slots[name] // 在initRender的时候绑了$slots，$slots走了resolveSlots方法，其实就是将有slot的节点,push到对象的slot数组里，然后合成一个对象。
    // $slot:{
    //    header:[vnode,vnode],
    //    footer:[vnode],
    //    default:[vnode,vnode,vnode]
    // }
    // warn duplicate slot usage
    if (slotNodes) {
      if (process.env.NODE_ENV !== 'production' && slotNodes._rendered) {
        warn(
          `Duplicate presence of slot "${name}" found in the same render tree ` +
          `- this will likely cause render errors.`,
          this
        )
      }
      slotNodes._rendered = true // 把slotNodes设置为true
    }
    nodes = slotNodes || fallback // 返回slotNodes，不存在就返回默认children
  }

  const target = props && props.slot
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
