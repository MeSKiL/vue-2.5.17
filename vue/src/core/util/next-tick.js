/* @flow */
/* globals MessageChannel */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

const callbacks = []
let pending = false

function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
let microTimerFunc
let macroTimerFunc
let useMacroTask = false

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
/* istanbul ignore if */
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) { // 浏览器是否原生支持setImmediate
  macroTimerFunc = () => { // 宏任务
    setImmediate(flushCallbacks) // 如果支持就直接调用setImmediate
  }
} else if (typeof MessageChannel !== 'undefined' && ( // 如果没有setImmediate，就用messageChannel实现宏任务
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  /* istanbul ignore next */
  macroTimerFunc = () => { // 否则就降级为setTimeout0
    setTimeout(flushCallbacks, 0)
  }
}

// Determine microtask defer implementation.
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => { // 微任务如果浏览器支持微任务，就用promise实现
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
} else { // 否则微任务就是宏任务
  // fallback to macro
  microTimerFunc = macroTimerFunc
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask (fn: Function): Function {
  return fn._withTask || (fn._withTask = function () {
    useMacroTask = true
    const res = fn.apply(null, arguments)
    useMacroTask = false
    return res
  })
}
// tick其实就是主线程。主线程执行完了会去任务队列中获取任务。
export function nextTick (cb?: Function, ctx?: Object) { // 当前无论执行多少次，都会把任务添加到callbacks里，在下一个tick里执行
  let _resolve
  callbacks.push(() => { // 以匿名函数的方式加入callback，如果有某个函数执行失败了不会影响主流程
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) { // 如果是promise就会resolve然后执行then函数
      _resolve(ctx)
    }
  })
  if (!pending) { // 确保这里的逻辑只走一次
    pending = true
    if (useMacroTask) { // 通过useMacroTask判断是用macroTimerFunc执行还是用microTimerFunc执行
      macroTimerFunc() // 已经执行了，但是nextTick还在往callback里添加任务
    } else {
      microTimerFunc()
    }
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') { // 如果没有callback就会返回promise，那么nextTick的then就会在callbacks走的时候调用了_resolve，执行then
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
