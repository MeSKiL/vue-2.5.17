/* @flow */

import { warn } from 'core/util/index'
import { cached, isUndef, isPlainObject } from 'shared/util'

const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>
} => {
  // 通过name解析修饰符,addHandler的时候添加的修饰符
  const passive = name.charAt(0) === '&'
  name = passive ? name.slice(1) : name
  const once = name.charAt(0) === '~' // Prefixed last, checked first
  name = once ? name.slice(1) : name
  const capture = name.charAt(0) === '!'
  name = capture ? name.slice(1) : name
  return {
    name,
    once,
    capture,
    passive
  }
})

export function createFnInvoker (fns: Function | Array<Function>): Function {
  function invoker () { // 事件最终执行的回调函数
    // 获取invoker上的的fns，循环执行
    const fns = invoker.fns
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        cloned[i].apply(null, arguments)
      }
    } else {
      // return handler return value for single handlers
      return fns.apply(null, arguments)
    }
  }
  invoker.fns = fns
  return invoker
}

export function updateListeners ( // 自定义事件也会用这个方法添加事件
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  vm: Component
) {
  let name, def, cur, old, event
  for (name in on) {
    // 获取事件名
    def = cur = on[name]
    old = oldOn[name]
    event = normalizeEvent(name) // 事件对象
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler
      event.params = def.params
    }
    if (isUndef(cur)) { // 如果新添加的事件没有定义的话就警告
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    } else if (isUndef(old)) { // 如果old没有定义，就是create的情况
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur) // cur是匿名函数或者是方法名，或者是数组
      } // on[click] = invoker
      add(event.name, cur, event.once, event.capture, event.passive, event.params) // 添加dom事件
      // 组件的自定义事件的add是不一样的
      // 组件其实是调用了vm.$on
    } else if (cur !== old) {
      // 新旧的回调不一样的时候，就把old的fns指向新的就行了，因为invoker执行的时候是在invoker.fns上拿回调函数。随意改变fns的指向就行了
      old.fns = cur
      on[name] = old // 把on[name]修正为old
    }
  }
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name)
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
