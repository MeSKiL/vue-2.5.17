/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () { // 定义了sharedPropertyDefinition的get和set
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition) // target的key上有get和set
  // 当访问vm.key就等于访问vm.sourceKey.key，当调用this.message的时候，如果message是在data里声明的，实际上访问了this._data.message
  // 这也就是给vm._data赋值的原因

  // methods和props同理
}

export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props) // 有props就初始化props，变成响应式，代理到this上
  if (opts.methods) initMethods(vm, opts.methods) // 有methods就初始化methods，代理到this上，并且不能与props的key重复
  if (opts.data) { // 如果有data就初始化data，没有就初始化空
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed) // 初始化computed
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch) // 初始化watch
  }
}

function initProps (vm: Component, propsOptions: Object) { // initState里执行
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (vm.$parent && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value) // 将props的key变为响应式的
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) { // initState里执行
  let data = vm.$options.data // 在$options.data中获取data
  data = vm._data = typeof data === 'function' // 是否是function
    ? getData(data, vm)
    : data || {} // 否则就是data||{}，并且给vm._data也赋值一份
  if (!isPlainObject(data)) {
    data = {} // 如果不是对象就，data就为空，并且在开发环境报警告
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data) // 拿到data的key
  const props = vm.$options.props // 拿到props的key
  const methods = vm.$options.methods // 拿到methods的key
  let i = keys.length
  while (i--) { // data上的key不能在props或者methods上出现
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) { // 如果methods上有data的key就警告
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) { // 如果props上有data的key就警告
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      proxy(vm, `_data`, key) // 将每个this.key（data里的key）都代理到this._data.key上
    }
  }
  // observe data
  observe(data, true /* asRootData */) // 响应式处理
  // 在data上加了__ob__属性，并且指向data上的Observe实例,之后把data的除了__ob__属性外的属性变成响应式的
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm) // 是函数就调用这个函数，并返回结果对象
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { computed: true }

function initComputed (vm: Component, computed: Object) { // initState里执行
  // computed watcher 的 dep里也是有watcher的。也就是有人监听computed。
  // 并且computed也有自己的watcher监听自己依赖的属性。依赖的属性变化的话就会执行computed watcher 的update。如果没有watcher在监听这个computed直接就过了。反正也没人管我。如果有watcher在监听我。
  // 就会走getAndInvoke 并且传入更新watcher的回调函数。在getAndInvoke中。计算新的computed值，如果没变就不执行回调，反正也没变，没必要重新渲染。变化了就重新渲染，然后得到新的computed值。
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null) // 先缓存了computedWatchers
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) { // 遍历计算属性
    const userDef = computed[key] // userDef是计算属性的值,通常是函数，也可以是对象,如果是对象必须有get属性
    const getter = typeof userDef === 'function' ? userDef : userDef.get // 通过getter得到计算属性的方法
    if (process.env.NODE_ENV !== 'production' && getter == null) { // 如果没有getter就会警告
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher( // 实例化watcher
          // 也就是说computed watcher监听的属性变化了以后，触发了computed watcher的update，就会重新对computed求值，然后如果发生改变，就触发监听computed watcher 的watcher。
        vm,
        getter || noop, // getter就是computed的方法
        noop, // computed的watcher主要还是用来渲染的，所以回调是noop
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) { // 如果key不在vm里，就调用defineComputed,组件的computed的key是在vm中的，因为在Vue.extend的时候执行了initComputed
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) { // 在data或者props里就报错
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed ( // initComputed中执行
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 在访问computed的key的时候，会返回计算后的结果。并且添加渲染watcher进入dep中，。如果computed watcher发生了update(就说明computed watcher监听的属性变化了)就判断computed的结果是否发生改变，改变了就触发渲染watcher
  const shouldCache = !isServerRendering()
  // shouldCache true
  if (typeof userDef === 'function') { // 如果计算属性是函数的话
    // const sharedPropertyDefinition = {
    //   enumerable: true,
    //   configurable: true,
    //   get: noop,
    //   set: noop
    // }
    sharedPropertyDefinition.get = shouldCache // 当访问computed的值的时候会执行对应的get方法,如果是函数就是createComputedGetter(key)的返回值。也就是computed方法执行后的结果。
        // 拿到结果的同时，在computed watcher的dep里添加当前的渲染watcher。当computed监听的值改变以后，就会触发computed的update方法。如果判断有watcher监听computed，就会在
        // render的时候访问
      ? createComputedGetter(key)
      : userDef
    sharedPropertyDefinition.set = noop
  } else { // 如果不是函数，那就是对象，就会有get
    sharedPropertyDefinition.get = userDef.get // 定义get就是userDef的get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key) // 当访问computed值的时候，会得到这个函数的返回值
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set // set也就是userDef的set
      ? userDef.set
      : noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition) // 当访问target.key的时候。结果是sharedPropertyDefinition，组件的话target组件的是原型。通过祖件的实例依然可以访问到getter。为了给多组件共享。
}

function createComputedGetter (key) { // 在render的过程中访问到computed的时候，拿到watcher，调用watcher.depend,然后计算
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      watcher.depend() // 给computed watcher的dep里收集依赖
      return watcher.evaluate() // 返回computed的值
    }
  }
}

function initMethods (vm: Component, methods: Object) { // initState里执行
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) { // 为空就警告
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) { // props里不能有一样key的属性，因为initProps在前
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) { // initState里执行
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) { // handler可以是数组也可以是普通的对象或函数
      for (let i = 0; i < handler.length; i++) { // 如果是数组就遍历数组去调用createWatcher
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher ( // 做数据规范化，把数据变成我们需要的类型。然后调用$watch
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) { // handler如果是对象就去handler里的handler属性,必须是个方法
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) { // instance/index
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function (newData: Object) {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function ( // 用来higher order function 比如节流函数。
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) { // 如果cb是对象，就规范成函数
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true // 如果是$watch创建的watcher，那就是一个user watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) { // 如果options里配置了immediate，就触发一次callback
      cb.call(vm, watcher.value)
    }
    return function unwatchFn () { // 返回一个函数，这个函数执行的话可以销毁这个watcher
      watcher.teardown()
    }
  }
}
