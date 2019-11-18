/* @flow */

import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

type VNodeCache = { [key: string]: ?VNode };

function getComponentName (opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag)
}

function matches (pattern: string | RegExp | Array<string>, name: string): boolean { // 写include和exclude的时候，可以写成字符串，数组，正则等形式。
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

function pruneCache (keepAliveInstance: any, filter: Function) {
  // 获取缓存中的节点，如果不满足include，就删除。
  // 剩下的如果不满足exclude。就保留。
  const { cache, keys, _vnode } = keepAliveInstance
  for (const key in cache) {
    const cachedNode: ?VNode = cache[key]
    if (cachedNode) {
      const name: ?string = getComponentName(cachedNode.componentOptions)
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

function pruneCacheEntry (
  cache: VNodeCache,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  const cached = cache[key] // 获取要销毁的vnode
  if (cached && (!current || cached.tag !== current.tag)) { // 存在就销毁。如果要删的和当前渲染的是同一个，就不销毁。但是也从缓存里移除。
    cached.componentInstance.$destroy()
  }
  cache[key] = null // 把key从缓存清除
  remove(keys, key) // 从keys中移除
}

const patternTypes: Array<Function> = [String, RegExp, Array]

export default { // 在initGlobalApi的时候，初始化到了全局
  name: 'keep-alive',
  abstract: true,

  // 走到keep-alive就会init。走keep-alive的$mount，也就走到keep-alive的render。然后获取第一个子组件，设置他的keepAlive为true，然后返回子组件。走到update，也就是patch。这时候isReactivated就是true。所以是不会patch keepAlive的
  // keep-alive更新的时候会走到patchVnode，然后走keep-alive的prepatch，然后因为有children，就更新slot后，强制更新。强制更新可能会命中缓存，就取缓存的。然后再一次走到patch，然后走到createComponent

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  created () {
    this.cache = Object.create(null) // 缓存keep-alive的vnode
    this.keys = []
  },

  destroyed () {
    for (const key in this.cache) { // 销毁缓存中所有节点
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted () {
    this.$watch('include', val => { // watch到include变化时，执行回调函数。
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  render () {
    // render的时候，会拿到第一个组件节点，然后符合要求就放入缓存中，然后设置组件的keepAlive为true
    const slot = this.$slots.default // 获取默认插槽的内容
    const vnode: VNode = getFirstComponentChild(slot) // 获取第一个组件节点,keep-alive缓存组件节点
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    if (componentOptions) {
      // check pattern
      const name: ?string = getComponentName(componentOptions) // 获取组件名称
      const { include, exclude } = this
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) { // 如果include存在，但是组件不在里面，或者exclude存在，并且组件在里面，都return。不缓存了。
        return vnode
      }

      // 下面的vnode都是第一个子组件节点

      const { cache, keys } = this
      const key: ?string = vnode.key == null // 如果有key，就用key，没有就用cid拼接tag。也就是用来缓存的key。
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      if (cache[key]) { // 如果命中了缓存，直接把vnode的instance指向缓存的instance
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        remove(keys, key)
        keys.push(key) // 把key去除，然后添加到最后一个
      } else {
        cache[key] = vnode // 没有命中就增加缓存，然后把key push到keys中
        keys.push(key)
        // prune oldest entry
        if (this.max && keys.length > parseInt(this.max)) {
          // 如果设置了max，就把最后一个 vnode从缓存中移除。也就是近期最不常用的就移除缓存。LRU
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      vnode.data.keepAlive = true
    }
    return vnode || (slot && slot[0])
  }
}
