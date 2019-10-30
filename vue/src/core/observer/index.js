/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer { //observe 方法中被实例化 initData的时候会把对象data传入Observer
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this) // 给value添加__ob__这个属性,并且指向当前这个Observer实例
    if (Array.isArray(value)) { // 如果value是数组
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      this.observeArray(value) // 遍历数组元素，递归调用观察者,传入data的话不是数组，就直接走walk
    } else {
      this.walk(value) // 遍历对象上的所有属性，调用defineReactive 会把value中属性去做枚举，并依次调用defineReactive，但是不会枚举__ob__,因为__ob__是不可枚举的，如果不用def，__ob__也会调用defineReactive，没有必要
    }
  }

  /**
   * Walk through each property and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) { //
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void { // 这个value已经有__ob__了就返回这个ob 否则符合条件的话，就新建一个ob并返回
  // initData中传入了data
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  // value 必须是对象并且不能是VNode的实例
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__ // 如果value有__ob__这个属性，并且这个属性是Observer的实例，ob就为value.__ob__并返回
  } else if (
    shouldObserve && // shouldObserve是全局控制要不要执行ob = new Observer这个逻辑
    !isServerRendering() && // 不是服务端渲染
    (Array.isArray(value) || isPlainObject(value)) && // 是数组或者对象
    Object.isExtensible(value) && // 可扩展的
    !value._isVue // 不是vue实例
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive ( // 把对象的属性变成响应式的,其实就是给对象的所有属性加上getter和setter，当获取和设值的时候，执行一些额外的操作
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // 一个属性有一个dep

  const property = Object.getOwnPropertyDescriptor(obj, key) // 拿到对象属性的定义
  if (property && property.configurable === false) { // 如果configurable是false就什么都不做
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) { // 如果没有getter或者有setter，并且arg的长度为2，对应了defineReactive(obj, keys[i])
    //就给val赋值为obj[key]， 赋值初始值
    val = obj[key]
  }

  let childOb = !shallow && observe(val) // 对val递归调用observe,如果一个对象的属性值是对象的话，会递归调用observe，保证整个对象全是响应式的
  Object.defineProperty(obj, key, { // 把对象属性变成响应式对象
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () { // 访问响应式的时候会触发getter 依赖收集

      // 当一个数据的getter被访问后，会把当前的watcher收集起来作为订阅者

      const value = getter ? getter.call(obj) : val // 有getter就取getter没有就取val
      if (Dep.target) { // 有target的时候
        dep.depend() // 调用watcher的addDep方法
        if (childOb) { // 如果子属性是对象，就调用childOb.dep.depend() todo 有啥用
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) { // 数据改变时，会走set 派发更新
      const value = getter ? getter.call(obj) : val // 获取旧的值
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        // 如果与新的值相同就返回
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 给val赋新值
      childOb = !shallow && observe(newVal) // 如果赋了新值并且也是一个对象，就把他变成响应式的
      dep.notify() // 派发更新
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
