/* @flow */

import { emptyNode } from 'core/vdom/patch'
import { resolveAsset, handleError } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'

export default {
  create: updateDirectives,
  update: updateDirectives,
  destroy: function unbindDirectives (vnode: VNodeWithData) {
    updateDirectives(vnode, emptyNode)
  }
}

function updateDirectives (oldVnode: VNodeWithData, vnode: VNodeWithData) { // patch的时候,执行create钩子函数执行到了这里
  if (oldVnode.data.directives || vnode.data.directives) {
    _update(oldVnode, vnode)
  }
}

function _update (oldVnode, vnode) {
  const isCreate = oldVnode === emptyNode // 根据oldVnode和vnode的情况看是create过程还是destroy过程
  const isDestroy = vnode === emptyNode
  const oldDirs = normalizeDirectives(oldVnode.data.directives, oldVnode.context)
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context)
  // newDirs[v-model] = dir

  const dirsWithInsert = []
  const dirsWithPostpatch = []

  let key, oldDir, dir
  for (key in newDirs) { // 遍历newDirs，拿到指令
    oldDir = oldDirs[key]
    dir = newDirs[key]
    if (!oldDir) { // 如果没有old，就是走bind
      // new directive, bind
      callHook(dir, 'bind', vnode, oldVnode) // 执行dir.def中的bind
      if (dir.def && dir.def.inserted) { // 如果有inserted就把dir push到dirsWithInsert中
        dirsWithInsert.push(dir)
      }
    } else { // 如果oldDir存在的话。就执行update
      // existing directive, update
      dir.oldValue = oldDir.value
      callHook(dir, 'update', vnode, oldVnode)
      if (dir.def && dir.def.componentUpdated) { // 如果有componentUpdated，就把dir push到dirsWithPostpatch
        dirsWithPostpatch.push(dir)
      }
    }
  }

  if (dirsWithInsert.length) {
    const callInsert = () => { // dirsWithInsert中的依次执行inserted方法
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], 'inserted', vnode, oldVnode) // v-model在运行时绑定了两个事件，onCompositionStart，onCompositionEnd
      }
    }
    if (isCreate) { // 如果是创建过程，就把callInsert merge 到insert钩子中，也就是执行insert的时候也会执行callInsert
      mergeVNodeHook(vnode, 'insert', callInsert) // 实际执行wrappedHook，执行callInsert
    } else { // 不是创建过程就直接执行
      callInsert()
    }
  }

  if (dirsWithPostpatch.length) { // 如果有dirsWithPostpatch，就merge到postpatch中
    mergeVNodeHook(vnode, 'postpatch', () => {
      for (let i = 0; i < dirsWithPostpatch.length; i++) {
        callHook(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode)
      }
    })
  }

  if (!isCreate) {
    for (key in oldDirs) {
      if (!newDirs[key]) {
        // no longer present, unbind
        callHook(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy)
      }
    }
  }
}

const emptyModifiers = Object.create(null)

function normalizeDirectives (
  dirs: ?Array<VNodeDirective>,
  vm: Component
): { [key: string]: VNodeDirective } { // 设置modifiers和def
  const res = Object.create(null)
  if (!dirs) {
    // $flow-disable-line
    return res
  }
  let i, dir
  for (i = 0; i < dirs.length; i++) { // 对指令数组遍历，没有modifiers就创建空对象
    dir = dirs[i]
    if (!dir.modifiers) {
      // $flow-disable-line
      dir.modifiers = emptyModifiers
    }d
    res[getRawDirName(dir)] = dir
    // res[v-model] = dir
    dir.def = resolveAsset(vm.$options, 'directives', dir.name, true)
    // 在vm.$options.directives[model]上有componentUpdated和inserted，因为是Vue上的，被merge到了vm.$options上
    // modal的话就会往def上挂了componentUpdated和inserted
    // 内置directives的定义是componentUpdated和inserted
  }
  // $flow-disable-line
  return res
}

function getRawDirName (dir: VNodeDirective): string {
  return dir.rawName || `${dir.name}.${Object.keys(dir.modifiers || {}).join('.')}`
}

function callHook (dir, hook, vnode, oldVnode, isDestroy) {
  const fn = dir.def && dir.def[hook]
  if (fn) {
    try {
      fn(vnode.elm, dir, vnode, oldVnode, isDestroy)
    } catch (e) {
      handleError(e, vnode.context, `directive ${dir.name} ${hook} hook`)
    }
  }
}
