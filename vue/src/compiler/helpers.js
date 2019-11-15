/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

export function baseWarn (msg: string) {
  console.error(`[Vue compiler]: ${msg}`)
}

export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

export function addProp (el: ASTElement, name: string, value: string) {
  (el.props || (el.props = [])).push({ name, value })
  el.plain = false
}

export function addAttr (el: ASTElement, name: string, value: any) {
  (el.attrs || (el.attrs = [])).push({ name, value })
  el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr (el: ASTElement, name: string, value: any) {
  el.attrsMap[name] = value
  el.attrsList.push({ name, value })
}

export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  modifiers: ?ASTModifiers
) {
  (el.directives || (el.directives = [])).push({ name, rawName, value, arg, modifiers })
  el.plain = false
}

export function addHandler ( // 给el添加事件属性，nativeEvents或是events

  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: Function
) {
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.'
    )
  }

  // check capture modifier
  if (modifiers.capture) { // 如果有capture会拼接!
    delete modifiers.capture
    name = '!' + name // mark the event as captured
  }
  if (modifiers.once) { // 如果有once会拼接~
    delete modifiers.once
    name = '~' + name // mark the event as once
  }
  /* istanbul ignore if */
  if (modifiers.passive) { // 如果有passive会拼接&
    delete modifiers.passive
    name = '&' + name // mark the event as passive
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  if (name === 'click') { // 如果事件名是click
    if (modifiers.right) { // modifiers有right就改name为contextmenu
      name = 'contextmenu'
      delete modifiers.right
    } else if (modifiers.middle) { // modifiers有middle，就把name改为mouseup
      name = 'mouseup'
    }
  }

  let events
  if (modifiers.native) { // modifiers有native的时候，event就会指向nativeEvents
    // native就是给组件绑click的时候，没native是不执行的
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    events = el.events || (el.events = {})
  } // 不存在就构造空对象

  const newHandler: any = {
    value: value.trim()
  } // 构造newHandler对象。如果有modifiers就添加为newHandler的属性
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  const handlers = events[name]
  /* istanbul ignore if */
  if (Array.isArray(handlers)) { // 如果handlers已经是数组了，就根据重要与否，加在最前面还是最后面
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) { // 有的话根据important与否,看加在数组的某个地方
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else { // events里没有这个事件就新建。
    events[name] = newHandler
  }

  el.plain = false
}

export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name) // 获取动态绑定的值
  if (dynamicValue != null) {
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    const staticValue = getAndRemoveAttr(el, name) // 获取静态的值
    if (staticValue != null) {
      return JSON.stringify(staticValue)
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
export function getAndRemoveAttr ( // 把name从attrsList中删除,removeFromMap为true是，从attrsMap里也删除
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  return val
}
