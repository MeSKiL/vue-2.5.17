/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount // 先获取在runtime/index上定义的$mount并缓存起来
/**
 * 先对el解析，获取要挂载的dom对象
 * 然后判断有没有render function，没有就使用template
 * 最终template又编译成render function
 * vue最终使用的就是render function
 * 最后调用mount
 *
 * 因为是compiler，所以需要做这一步操作，可能写template不写render，需要编译,将template编译后重新调用存下的$mount。
 *
 * 对有template并且不合法的情况进行了警告
 * */
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el) // el现在的dom对象

  /* istanbul ignore if */
  if (el === document.body || el === document.documentElement) { // 如果el是body或者html文档，会报错，因为会覆盖
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  if (!options.render) { // 如果没有定义render
    let template = options.template
    if (template) { // 如果有模板
      if (typeof template === 'string') { // 模板是字符串
        if (template.charAt(0) === '#') { // 并且第一个字符是#
          template = idToTemplate(template)  // 做个处理 todo
          // 警告
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) { // 如果是节点，就去innerHTML
        template = template.innerHTML
      } else { // 否则报警告无效的template
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) { // 没有模板，但是有el
      template = getOuterHTML(el) // 返回一个字符串
    }
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) { // 编译相关
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, { // 编译入口 实际上执行了to-function中的compileToFunctions
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 有了render函数后就会调用之前保存下来的mount
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) { // el有outerHTLL就直接返回
    return el.outerHTML
  } else { // 如果没有就在外面包一层，并返回innerHTML
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
