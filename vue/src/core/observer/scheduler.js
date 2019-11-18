/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () { // 当数据发生变化时会执行
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  queue.sort((a, b) => a.id - b.id) // 把watcher从小到大排序，组件的更新是从父到子，创建也是从父到子，所以要保证父watcher在前面，也就是小的在前面

  //因为先init watcher user watcher是在渲染watcher之前的，所以也要先执行
  // 渲染watcher是在在init watcher之后mountComponent里的
  //如果组件在父组件的watcher里销毁的时候，他的watcher就不用执行了

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) { // 遍历queue，如果有before就执行before
    // 在循环的时候queue.length会发生变化
    watcher = queue[index]
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null // 因为has[id]在这里被设置为了null，所以run的时候还能把这个watcher加进去。所以会导致死循环
    watcher.run() // 执行 watcher.run可能执行queueWatch
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) { // 如果有无限循环更新就警告
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  resetSchedulerState() // 重置全局变量的状态

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue) // 执行生命周期

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // if (isRenderWatcher) { // 如果是渲染watch就在vm上加上_watcher
    //       vm._watcher = this
    //     }
    //     vm._watchers.push(this) // 并且把this放入watchers
    // 在Watcher的构造函数中，如果是渲染watcher就会赋值给vm._watcher
    if (vm._watcher === watcher && vm._isMounted) { // 满足_watcher是渲染watcher并且挂载好了的情况下，执行updated
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) { // 把实例添加到数组中。
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) { // 遍历queue，执行activated生命周期函数
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
export function queueWatcher (watcher: Watcher) { // 在watch的update中执行，用于派发更新
  // 主要是把watcher push到queue里面
  const id = watcher.id // watcher初始化的时候id也是自增的
  if (has[id] == null) { // 如果队列里没有这个watcher的时候，才会执行下面的逻辑
    has[id] = true
    if (!flushing) { // 如果flushing是false，直接往队列里加就行了。
      // 同一个tick内就会push一次到一个队列里
      queue.push(watcher) // 把watcher push到队列里面,比如同时更新了多个数据，但是订阅者都是一个watcher todo 一次set了多个data，这些watcher会在nextTick一起flushSchedulerQueue。有没有可能在nexttick的时候，这个方法里的data还没变完，是不是就在下一个tick执行了
    } else { // 如果在flushSchedulerQueue后又进来了,也就是说在run的时候，又set了 a ，就会又执行 a 的各个watcher的update，就又进来了。如果监听a的watcher不在queue里就插入到queue里去。
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) { // 当满足其中一个条件的时候，就可以在queue中插入一个新的watcher
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      waiting = true
      nextTick(flushSchedulerQueue) // 保证只执行一次,再下一个tick执行东西
      // nextTick执行的flushSchedulerQueue如果又调用了queueWatcher，因为flushing是true，waiting也是true，所以不会再下一个nextTick执行，而是直接往这个tick的queue里推。
    }
  }
}
