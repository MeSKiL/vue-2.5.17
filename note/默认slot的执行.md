##默认slot的执行
首先是子组件在init的时候会走initInternalComponent，然后在```opts._renderChildren = vnodeComponentOptions.children```
在_renderChildren上获取父组件实例上的children。父组件createComponent创建vnode的时候，会传入children。

子组件在initInternalComponent之后会走到initRender```vm.$slots = resolveSlots(options._renderChildren, renderContext)```。
initRender的时候赋值了$slot，通过执行resolveSlots方法，传入了父占位符节点的children，和父占位符结点的实例。
来看看resolveSlots是啥。

首先是对children的遍历，如果children有slot属性，就把这个属性删了。然后如果data的slot存在，就说明他是有name的。
name为编译阶段赋值的name或者是传'"""'是默认的default。然后往this.$slots[name]里push这个子节点。
如果是没有后slot就说明是default节点，就往this.$slots[default]里push。
这个时候这个组件的实例上就有$slots了
```javascript 1.6
export function resolveSlots (
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  const slots = {}
  if (!children) {
    return slots
  }
  for (let i = 0, l = children.length; i < l; i++) { // 遍历children
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    if (data && data.attrs && data.attrs.slot) { // 如果有slot就把这个属性删了
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    if ((child.context === context || child.fnContext === context) && // 占位符节点和子节点的实例是一样的
      data && data.slot != null
    ) {
      const name = data.slot
      const slot = (slots[name] || (slots[name] = [])) // 如果slot[name]不存在就新建一个空数组，把child push进slot[name]中
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children || [])
      } else {
        slot.push(child)
      }
    } else { // 默认插槽是不写slot的，就push到default中
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) {
      delete slots[name]
    }
  }
  return slots
}
```
之后会走到子组件的render，走到render的时候就会执行之前编译过程中的_t。_t是什么呢？其实就是```  target._t = renderSlot ```
来看看renderSlot具体干了什么。

略过作用域slot，下次在看，先看普通slot，slotNodes就是this.$slots[name]，很简单就是获取刚刚存的值。
slot的name是header就获取 之前slot=header的数组里的节点。然后返回节点数组，很好理解。
```javascript 1.6
export function renderSlot (
  name: string, // slotName
  fallback: ?Array<VNode>, // children
  props: ?Object,
  bindObject: ?Object
): ?Array<VNode> {
  const scopedSlotFn = this.$scopedSlots[name]
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
    }
    nodes = scopedSlotFn(props) || fallback
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
```
其实slot就是把自己的父占位符下的节点，插到了自己的slot所在的位置。其实也是自己和自己的通信，只不过一个是在父占位符下的。
一个是在组件内部的。
