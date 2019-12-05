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
      this.computed = !!options.computed // computed的时候computed是true
      this.sync = !!options.sync
      this.before = options.before // 保存before
    } else {
      this.deep = this.user = this.computed = this.sync = false // 否则给默认值
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.computed // for computed watchers computed的时候是true

    //依赖收集
    this.deps = []
    this.newDeps = []

    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()

      : '' // 开发环境expression就是expOrFn toString，仅仅是开发环境下可以看到expression
    // parse expression for getter
    if (typeof expOrFn === 'function') { // 如果是函数，那实例上的getter就是这个函数,渲染watcher的updateComponent是一个函数，compute的watcher一般也是一个函数，也可能是compute(对象形式) 的get结果
      // computed watcher就是计算函数 render watcher就是updateComponent
      this.getter = expOrFn
    } else { // 否则会调用parsePath(expOrFn) user watcher的expOrFn基本是字符串
      // watch 一个字符串
      this.getter = parsePath(expOrFn) // 其实是用来访问数据的，帮数据做依赖收集，收集这个user watcher
      if (!this.getter) { // this.getter其实是parsePath返回的函数
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    if (this.computed) { // 如果是computed属性，创建过程中不会求值 this.value为空值，并且初始化一个dep
      this.value = undefined
      this.dep = new Dep() // computed watcher有自己的dep
    } else {
      // 渲染watcher和user watcher上会执行get求值
      this.value = this.get()
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
      // userWatcher的时候，传入vm，触发getter也就是触发parsePath返回的函数,就会访问到监听的值。就会添加到那个值的dep里去了
      value = this.getter.call(vm, vm) // 调用getter 在渲染watcher里就是调用了updateComponent的逻辑,然后就会走render，就会访问到模板中的数据了，这个时候的watcher已经Dep.target了，render就会访问到getter里面的数据
      // 执行完以后也就在watcher上挂好了这个组件监听的数据的dep。也在dep上挂好了这个watcher
      // computed计算结果 调用get的时候，可能会访问一些属性，也会把computed的watcher添加到那些属性的dep里,computed依赖的值发生变化的话，会触发computed watcher的update
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) { // 深度遍历这个方法
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
    // 所以基本所有的watcher都是下个tick走的，除了sync的user watcher。
    // computed watcher被触发了，就触发渲染watcher，下一个tick渲染。computed watcher就是工具人
    /* istanbul ignore else */
    if (this.computed) {
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      if (this.dep.subs.length === 0) { // 这里面应该有一个渲染watcher
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        this.getAndInvoke(() => { // 重新对computed求值，如果值不一样，就会触发回调，就是更新渲染watcher，这里会把dirty变成true。也就说只有依赖发生变化了，才会把dirty变成true
          this.dep.notify() // 如果computed的值变了就重新渲染，就会触发渲染watcher，然后加入queueWatcher 下一个tick重新渲染了就会渲染computed的新值了
        })
      }
    } else if (this.sync) { // 如果user watcher里配置了sync，直接就run，不会在nextTick执行
      this.run()
    } else {
      queueWatcher(this) // watch队列, nextTick执行了flushSchedulerQueue，执行了run，也就是getAndInvoke，就又走了updateComponent。
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
    // 渲染watcher和user watcher完全不一样却用同一个方法。精彩。渲染watcher执行getter方法。user watcher判断前后的值执行回调。
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
  evaluate () { // 对computed求职，如果dirty是true，就返回结果并把dirty设为false。也就是只求一次值
    if (this.dirty) { // 只有依赖的属性发生变化了，dirty才会变成true，才会重新求值，不然就直接返回this.value。也就是computed watcher监听的属性变化了，并且computed的结果也变化了 执行computed watcher的update，之后会给computed重新求值.
      // 如果依赖的属性变化但是计算的结果没有变化，是不会设置dirty为true的
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }

  /**
   * Depend on this watcher. Only for computed property watchers.
   */
  depend () { // 给computed的dep的sub里添加依赖watcher，给依赖watcher里添加这个dep
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
