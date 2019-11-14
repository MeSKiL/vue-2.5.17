/* @flow */

import VNode from '../vnode'
import { createFnInvoker } from './update-listeners'
import { remove, isDef, isUndef, isTrue } from 'shared/util'

export function mergeVNodeHook (def: Object, hookKey: string, hook: Function) {
  if (def instanceof VNode) {
    def = def.data.hook || (def.data.hook = {})
  } // 组件的data有hook，普通节点没有hook就创建hook
  let invoker
  const oldHook = def[hookKey]

  function wrappedHook () {
    // 真正调用的时候会执行这个方法，执行后remove掉。保证执行一遍就不执行了。
    hook.apply(this, arguments)
    // important: remove merged hook to ensure it's called only once
    // and prevent memory leak
    remove(invoker.fns, wrappedHook)
  }

  if (isUndef(oldHook)) { // 如果没有定义oldHook，就创建一个invoker
    // no existing hook
    invoker = createFnInvoker([wrappedHook])
  } else {
    /* istanbul ignore if */
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // already a merged invoker
      invoker = oldHook // 如果定义过hook，并且之前merge过了就push到invoker的fns里
      invoker.fns.push(wrappedHook)
    } else { // 如果有hook但是没有merged过的，就创建一个数组返回
      // existing plain hook
      invoker = createFnInvoker([oldHook, wrappedHook])
    }
  }

  invoker.merged = true
  def[hookKey] = invoker
}
