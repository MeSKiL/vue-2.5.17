/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'
import {noop} from "../util/debug";
import {callHook} from "../instance/lifecycle";

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  computed: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  dep: Dep;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean // 是否是渲染watch
    // render 情况
/*    1.vm
      2.updateComponent
      3.noop
      4.{
          before(){
            if(vm._isMounted){
              callHook(vm.'beforeUpdate')
            }
          }
        }
      5.true */

  ) {
    this.vm = vm
    if (isRenderWatcher) { // 如果是渲染watch就在vm上加上_watcher
      vm._watcher = this
    }
    vm._watchers.push(this) // 并且把this放入watchers
    // options
    if (options) {
      // options存在就赋值
      this.deep = !!options.deep
      this.user = !!options.user
      this.computed = !!options.computed
      this.sync = !!options.sync
      this.before = options.before // 保存before
    } else {
      this.deep = this.user = this.computed = this.sync = false // 否则给默认值
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.computed // for computed watchers

    //依赖收集
    this.deps = []
    this.newDeps = []

    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : '' // 开发环境expression就是expOrFn toString，仅仅是开发环境下可以看到expression
    // parse expression for getter
    if (typeof expOrFn === 'function') { // 如果是函数，那实例上的getter就是这个函数,updateComponent是一个函数
      this.getter = expOrFn
    } else { // 否则会调用parsePath(expOrFn)
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    if (this.computed) {
      this.value = undefined
      this.dep = new Dep()
    } else {
      // 渲染watcher上会执行get求值
      this.value = this.get() // 有了watcher以后再执行get
    }
  }
  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () { // new watcher的时候执行的 this就是刚刚new的watcher实例
    pushTarget(this) // 把当前的渲染watcher作为Dep.target 然后把父组件的watcher压入栈中
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm) // 调用getter 在渲染watcher里就是调用了updateComponent的逻辑,然后就会走render，就会访问到模板中的数据了，这个时候的watcher已经Dep.target了，render就会访问到getter里面的数据
      // 执行完以后也就在watcher上挂好了这个组件监听的数据的dep。也在dep上挂好了这个watcher
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget() // 恢复上一次的target
      this.cleanupDeps() // 用新的依赖收集覆盖老的依赖收集，并且判断如果不监听某个dep了，就在dep的subs里去掉这个watcher
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      // 新的depIds里没有就添加
      this.newDepIds.add(id)
      this.newDeps.push(dep) // 如果newDepsId里没有，就再这个watcher的newDeps里记录这个dep
      if (!this.depIds.has(id)) { // 如果depIds里也没有那就再dep上记录这个watcher
        dep.addSub(this) // 就说明这个watcher这次应该在dep里但是上次不在dep的监听里，所以要给dep添上这个watcher
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () { // 清除依赖收集。数据改变会重新渲染，重新调用render，而后重新调用addDep
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) { // 如果deps(上次收集的依赖)里有的但是newDepIds(这次收集的依赖)里没有的，就说明现在这个watcher不监听这个dep了，就在这个dep的sub里删除这个watcher
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
    // deps为newDep 清空newDep，为下一次render调用addDep做准备
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.computed) {
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      if (this.dep.subs.length === 0) {
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        this.getAndInvoke(() => {
          this.dep.notify()
        })
      }
    } else if (this.sync) { // 同步watch
      this.run()
    } else {
      queueWatcher(this) // watch队列, nextTick执行了flushSchedulerQueue，执行了run，就又走了updateComponent
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () { // 渲染watcher会执行updateComponent
    if (this.active) {
      this.getAndInvoke(this.cb) // 传入watch的回调,渲染watcher的cb的就是空函数
    }
  }

  getAndInvoke (cb: Function) {
    const value = this.get() // user watch用this.get求新值，和老值做对比   渲染watcher走get，也就是再一次执行了updateComponent
    if (
      value !== this.value ||
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) { // 如果新值老值不一样就会执行回调
      // set new value
      const oldValue = this.value
      this.value = value
      this.dirty = false
      if (this.user) {
        try {
          cb.call(this.vm, value, oldValue) // watch:{xxx(val,oldValue)}
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        cb.call(this.vm, value, oldValue)
      }
    }
  }

  /**
   * Evaluate and return the value of the watcher.
   * This only gets called for computed property watchers.
   */
  evaluate () {
    if (this.dirty) {
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }

  /**
   * Depend on this watcher. Only for computed property watchers.
   */
  depend () {
    if (this.dep && Dep.target) {
      this.dep.depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
