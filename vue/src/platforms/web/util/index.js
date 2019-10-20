/* @flow */

import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
export function query (el: string | Element): Element {
  if (typeof el === 'string') { // 如果是字符串就直接找
    const selected = document.querySelector(el)
    if (!selected) { // 找不到就报错
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      return document.createElement('div') // 返回一个空的div
    }
    return selected
  } else { // 是元素就直接返回
    return el
  }
}
