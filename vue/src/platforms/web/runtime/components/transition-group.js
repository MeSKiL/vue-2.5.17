/* @flow */

// Provides transition support for list items.
// supports move transitions using the FLIP technique.

// Because the vdom's children update algorithm is "unstable" - i.e.
// it doesn't guarantee the relative positioning of removed elements,
// we force transition-group to update its children into two passes:
// in the first pass, we remove all nodes that need to be removed,
// triggering their leaving transition; in the second pass, we insert/move
// into the final desired state. This way in the second pass removed
// nodes will remain where they should be.

import { warn, extend } from 'core/util/index'
import { addClass, removeClass } from '../class-util'
import { transitionProps, extractTransitionData } from './transition'

import {
  hasTransition,
  getTransitionInfo,
  transitionEndEvent,
  addTransitionClass,
  removeTransitionClass
} from '../transition-util'

const props = extend({
  tag: String,
  moveClass: String
}, transitionProps) // 在transitionProps的基础上扩展了props和moveClass

delete props.mode

export default {
  props,

  beforeMount () {
    const update = this._update
    this._update = (vnode, hydrating) => { // 重写了_update，作为参数传入。
      // force removing pass
      this.__patch__( // 重写了update方法，其实就是会有两次patch过程
        this._vnode,
        this.kept,
        false, // hydrating
        true // removeOnly (!important, avoids unnecessary moves)
      )
      this._vnode = this.kept
      // 子节点的更新算法是不稳定的，不能保证移除节点的相对位置
      // 会先删除需要删除的节点，然后插入或者移动节点的位置。这样就会在合理的位置了。
      // 如果6个删成4个，位置就崩了，先删成4个，再去调位置就对了
      update.call(this, vnode, hydrating)
    }
  },

  render (h: Function) {
    const tag: string = this.tag || this.$vnode.data.tag || 'span' // 生成一个具体节点。没有tag就去span
    const map: Object = Object.create(null)
    const prevChildren: Array<VNode> = this.prevChildren = this.children // 用prevChildren保留children
    const rawChildren: Array<VNode> = this.$slots.default || []
    const children: Array<VNode> = this.children = []
    const transitionData: Object = extractTransitionData(this) // 提取transition的属性和事件，给transitionData

    for (let i = 0; i < rawChildren.length; i++) {
      const c: VNode = rawChildren[i]
      if (c.tag) {
        if (c.key != null && String(c.key).indexOf('__vlist') !== 0) { // 遍历children，没key就警告。在renderList的过程中，会给节点赋值isVList，然后再normalize-children中，如果有isVList但是没key，就给上__vlistxxxxx的key
          // 也就是说用transition-group必须手动写key
          children.push(c) // 如果有key就节点保留
          map[c.key] = c // 并且放到map里去
          ;(c.data || (c.data = {})).transition = transitionData // 在每个元素的transition上赋值transitionData。在enter的时候resolve用的
        } else if (process.env.NODE_ENV !== 'production') {
          const opts: ?VNodeComponentOptions = c.componentOptions
          const name: string = opts ? (opts.Ctor.options.name || opts.tag || '') : c.tag
          warn(`<transition-group> children must be keyed: <${name}>`)
        }
      }
    }

    if (prevChildren) { // 保留先前节点的位置信息，把两次都会渲染的节点放入kept中。
      const kept: Array<VNode> = []
      const removed: Array<VNode> = []
      for (let i = 0; i < prevChildren.length; i++) {
        const c: VNode = prevChildren[i]
        c.data.transition = transitionData // 给原先的节点赋值transitionData
        c.data.pos = c.elm.getBoundingClientRect() // 获取dom的位置信息
        if (map[c.key]) { // 如果上次渲染的节点也在这次的map中，就保留在kept里。如果不在，就丢到removed里。
          kept.push(c)
        } else {
          removed.push(c)
        }
      }
      this.kept = h(tag, null, kept) // 把kept的数据通过createElement方法，把生成的vnode保留到kept中，children是kept
      this.removed = removed // removed的数据放到removed中。
    }

    return h(tag, null, children) // 返回createElement函数的调用。
  },

  updated () { // 更新数据的时候触发updated
    const children: Array<VNode> = this.prevChildren
    const moveClass: string = this.moveClass || ((this.name || 'v') + '-move') // 传了moveClass就用moveClass。没传就默认的
    if (!children.length || !this.hasMove(children[0].elm, moveClass)) { // 如果没有定义moveClass。或者class的属性是否与class相关。没有moveClass或者没有都return
      return
    }
    // 如果确实与缓动相关，就执行下面的逻辑
    // we divide the work into three loops to avoid mixing DOM reads and writes
    // in each iteration - which helps prevent layout thrashing.
    children.forEach(callPendingCbs) // 过渡是异步的，如果前一个还没执行完，就调用了下一个，就把前一个的callback立即执行了
    children.forEach(recordPosition) // 记录节点的新位置
    children.forEach(applyTranslation) // 获取节点的旧位置和新位置，然后把节点返回旧的位置，设置偏移

    // force reflow to put everything in position
    // assign to this to avoid being removed in tree-shaking
    // $flow-disable-line
    this._reflow = document.body.offsetHeight // 通过获取offsetHeight使浏览器重绘。

    children.forEach((c: VNode) => {
      if (c.data.moved) {
        var el: any = c.elm
        var s: any = el.style
        addTransitionClass(el, moveClass) // 要偏移的元素，加上moveClass
        s.transform = s.WebkitTransform = s.transitionDuration = '' // 去掉transform
        el.addEventListener(transitionEndEvent, el._moveCb = function cb (e) { // 结束事件后，删除moveClass。
          if (!e || /transform$/.test(e.propertyName)) {
            el.removeEventListener(transitionEndEvent, cb)
            el._moveCb = null
            removeTransitionClass(el, moveClass)
          }
        })
      }
    })
  },

  methods: {
    hasMove (el: any, moveClass: string): boolean {
      /* istanbul ignore if */
      if (!hasTransition) {
        return false
      }
      /* istanbul ignore if */
      if (this._hasMove) { // 保留检测结果，以后不用重新检测了。
        return this._hasMove
      }
      // Detect whether an element with the move class applied has
      // CSS transitions. Since the element may be inside an entering
      // transition at this very moment, we make a clone of it and remove
      // all other transition classes applied to ensure only the move class
      // is applied.
      const clone: HTMLElement = el.cloneNode() // 先克隆一下，把原有 有_transitionClasses的class上的class都删了
      if (el._transitionClasses) {
        el._transitionClasses.forEach((cls: string) => { removeClass(clone, cls) })
      }
      addClass(clone, moveClass)
      clone.style.display = 'none' // 不影响渲染
      this.$el.appendChild(clone)
      const info: Object = getTransitionInfo(clone) // 看有没有transition
      this.$el.removeChild(clone)
      return (this._hasMove = info.hasTransform) // 判断是否有动画属性
    }
  }
}

function callPendingCbs (c: VNode) {
  /* istanbul ignore if */
  if (c.elm._moveCb) {
    c.elm._moveCb()
  }
  /* istanbul ignore if */
  if (c.elm._enterCb) {
    c.elm._enterCb()
  }
}

function recordPosition (c: VNode) {
  c.data.newPos = c.elm.getBoundingClientRect()
}

function applyTranslation (c: VNode) {
  const oldPos = c.data.pos
  const newPos = c.data.newPos
  const dx = oldPos.left - newPos.left
  const dy = oldPos.top - newPos.top
  if (dx || dy) {
    c.data.moved = true
    const s = c.elm.style
    s.transform = s.WebkitTransform = `translate(${dx}px,${dy}px)`
    s.transitionDuration = '0s'
  }
}
