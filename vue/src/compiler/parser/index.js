/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  pluckModuleFunction
} from '../helpers'

export const onRE = /^@|^v-on:/
export const dirRE = /^v-|^@|^:/
export const forAliasRE = /([^]*?)\s+(?:in|of)\s+([^]*)/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g

const argRE = /:(.*)$/
export const bindRE = /^:|^v-bind:/
const modifierRE = /\.[^.]+/g

const decodeHTMLCached = cached(he.decode)

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace

type Attr = { name: string; value: string };

export function createASTElement (
  tag: string,
  attrs: Array<Attr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs, // 属性数组
    attrsMap: makeAttrsMap(attrs), // 将attrs转为{name:value}形式
    parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 */
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  // 解析option
  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  transforms = pluckModuleFunction(options.modules, 'transformNode') // class style
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode') // model
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg) {
    if (!warned) {
      warned = true
      warn(msg)
    }
  }

  function closeElement (element) {
    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) { // web没有postTransforms
      postTransforms[i](element, options)
    }
  }

  parseHTML(template, { // 实际是调用了parseHTML方法,第一个环节是对template做解析，第二个环节是在解析过程中调用回调函数，做ast元素的生成
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    start (tag, attrs, unary) { // attrs在parseHTML里已经存好了。这里要处理了
      // 标签，属性，是否是自闭合标签 handleStartTag中会执行
      // 创建ast树，以及ast树管理
      // check namespace.
      // inherit parent ns if there is one
      // ast元素的创建 是否合法，处理v-for v-if等指令，处理element
      // ast树的处理 是否是根节点 是否有parent节点 是否是自闭合节点
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag) // 第一次进入的时候是undefined

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      let element: ASTElement = createASTElement(tag, attrs, currentParent) // 创建ast元素
      if (ns) {
        element.ns = ns
      }

      if (isForbiddenTag(element) && !isServerRendering()) { // 如果是不允许的标签，并且不是服务端渲染，就警告
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.'
        )
      }

      // apply pre-transforms
      for (let i = 0; i < preTransforms.length; i++) { // web 只对v-model处理
        element = preTransforms[i](element, options) || element
      }

      if (!inVPre) { // v-pre会让后面直接输入{{msg}}，而不是msg的值
        processPre(element) // 如果元素有v-pre，element.pre = true
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives

        // 对element做扩展 el上加上 for if once
        processFor(element)
        processIf(element)
        processOnce(element)
        // element-scope stuff
        processElement(element, options) // 处理Element
      }

      function checkRootConstraints (el) { // 根节点不能有slot和template，也不能有v-for
        if (process.env.NODE_ENV !== 'production') {
          if (el.tag === 'slot' || el.tag === 'template') {
            warnOnce(
              `Cannot use <${el.tag}> as component root element because it may ` +
              'contain multiple nodes.'
            )
          }
          if (el.attrsMap.hasOwnProperty('v-for')) {
            warnOnce(
              'Cannot use v-for on stateful component root element because ' +
              'it renders multiple elements.'
            )
          }
        }
      }

      // tree management
      if (!root) { // ast树的根节点，没有根节点的话，当前element就是根节点
        root = element
        checkRootConstraints(root) // root是否符合规则
      } else if (!stack.length) { // 下次进来如果stack.length为空，就说明不止一个根节点,就是根节点上有v-if的情况
        // allow root elements with v-if, v-else-if and v-else
        if (root.if && (element.elseif || element.else)) {
          checkRootConstraints(element)
          addIfCondition(root, {
            exp: element.elseif,
            block: element
          })
        } else if (process.env.NODE_ENV !== 'production') { // 如果有多个根节点但是不是v-if的情况，就警告
          warnOnce(
            `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`
          )
        }
      }
      if (currentParent && !element.forbidden) { // 如果有currentParent
        if (element.elseif || element.else) {
          processIfConditions(element, currentParent)
        } else if (element.slotScope) { // scoped slot
          currentParent.plain = false // 如果是slotScope，就拿到name，并且不添加到父节点的子节点中
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element // 而是作为父节点的scopedSlots的name属性
        } else {
          currentParent.children.push(element) // 父的children要push子的
          element.parent = currentParent // 子的parent指向父的
        }
      }
      if (!unary) { // 如果不是自闭合，就把当前节点给currentParent。因为之后的节点就是他的子节点了。
        currentParent = element
        stack.push(element) // 同时放到stack里，和parseHTML的作用相同。保证开始和闭合是对应的
      } else { // 如果是自闭合，就closeElement
        closeElement(element)
      }
    },

    end () {
      // parseEndTag走end
      // ast管理，以及标签结束逻辑
      // remove trailing whitespace
      const element = stack[stack.length - 1] // 获取stack的最后一个元素，这里的stack与parseHTML中的作用不同，parseHTML中的stack即起到了约束作用，也起到了管理作用。这里的作用是管理ast树。
      const lastNode = element.children[element.children.length - 1] // 获取该元素的最后一个子节点
      if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) { // 如果最后一个子节点的文本就pop
        element.children.pop()
      }
      // pop stack
      stack.length -= 1
      currentParent = stack[stack.length - 1] // 标签end了以后，pop出去后，currentParent指向新的栈顶元素
      closeElement(element) // 退出inVPre环境 与inPre环境
    },

    chars (text: string) {
      // parseHTML中执行
      // 处理文本，以及创建文本ast节点
      if (!currentParent) { // 没有text节点currentParent
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) { // 整个组件都纯文本就报这个警告
            warnOnce(
              'Component template requires a root element, rather than just text.'
            )
          } else if ((text = text.trim())) { // text在根节点之外也会报错
            warnOnce(
              `text "${text}" outside root element will be ignored.`
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      text = inPre || text.trim() // inPre环境或者text不为空格的情况下，如果当前节点的父节点是script或者style的话直接返回text，否则decode。如果不是inPre，并且text只有空格，就看preserveWhitespace和children的长度而返回' '还是''
        ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
        // only preserve whitespace if its not right after a starting tag
        : preserveWhitespace && children.length ? ' ' : ''
      if (text) {
        let res
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) { // text存在并且不为 ' '，而且不在inVPre环境下时，
          children.push({
            type: 2, // 表达式ast
            expression: res.expression,
            tokens: res.tokens,
            text
          })
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') { // inVPre或者纯文本节点
          children.push({ // 纯文本节点
            type: 3,
            text
          })
        }
      }
    },
    comment (text: string) {
      // 创建注释节点ast
      currentParent.children.push({ // 注释节点
        type: 3,
        text,
        isComment: true
      })
    }
  })
  return root
}

function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

function processRawAttrs (el) {
  const l = el.attrsList.length
  if (l) {
    const attrs = el.attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      attrs[i] = {
        name: el.attrsList[i].name,
        value: JSON.stringify(el.attrsList[i].value)
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

export function processElement (element: ASTElement, options: CompilerOptions) {
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  element.plain = !element.key && !element.attrsList.length

  processRef(element) // el.ref
  processSlot(element) // 处理slot
  processComponent(element) // 有el的is就增加el.component
  for (let i = 0; i < transforms.length; i++) {
    // class transformNode 赋el.staticClass和el.classBinding
    // style transformNode 赋el.staticStyle和el.styleBinding
    element = transforms[i](element, options) || element
  } // 去除了element里的class和style
  processAttrs(element) // 处理attrs里面的属性。
}

function processKey (el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production' && el.tag === 'template') {
      warn(`<template> cannot be keyed. Place the key on real elements instead.`)
    }
    el.key = exp
  }
}

function processRef (el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    el.refInFor = checkInFor(el)
  }
}

export function processFor (el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) { // 把v-for从attrsList删除，而保留在attrsMap里
    const res = parseFor(exp) // exp就是v-for的value
    if (res) { // 把res的属性扩展到el上
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

export function parseFor (exp: string): ?ForParseResult { // 其实就是将 (item,index) in/of data 解析出来，分别赋值到res上去
  const inMatch = exp.match(forAliasRE) // 正则匹配 (item,index) in/of data
  // inMatch[0] (item,index) in/of data
  // inMatch[1] (item,index)
  // inMatch[2] data
  if (!inMatch) return // 匹配不到就return
  const res = {}
  res.for = inMatch[2].trim() // data
  const alias = inMatch[1].trim().replace(stripParensRE, '') // item,index
  const iteratorMatch = alias.match(forIteratorRE)
  if (iteratorMatch) { // 对象的话有三个参数
    res.alias = alias.replace(forIteratorRE, '') // item key
    res.iterator1 = iteratorMatch[1].trim() // index value
    if (iteratorMatch[2]) { // undefined index
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else { // 没有逗号说明就一个参数，alias就alias
    res.alias = alias
  }
  return res
}

function processIf (el) { // v-if="isShow"
  const exp = getAndRemoveAttr(el, 'v-if') // 获取到v-if，并在attrsList上删了
  if (exp) { // exp 为v-if的表达式 isShow
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    } // 如果有v-else就把el.else设置为true
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) { // 如果有elseif就设置el.elseif
      el.elseif = elseif
    }
  }
}

function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`
    )
  }
}

function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`
        )
      }
      children.pop()
    }
  }
}

export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  // condition:{
  //    exp: exp,
  //    block: el
  // }
  if (!el.ifConditions) { // 如果el没有ifConditions，就把新建一个空数组
    el.ifConditions = []
  }
  el.ifConditions.push(condition) // 将condition push进ifConditions
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

function processSlot (el) {
  if (el.tag === 'slot') {
    // <slot name="header" />
    el.slotName = getBindingAttr(el, 'name') // 给slot节点加上slotName属性 header
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`
      )
    }
  } else { // 给slot节点加上slotScope属性
    let slotScope
    if (el.tag === 'template') {
      slotScope = getAndRemoveAttr(el, 'scope')
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && slotScope) {
        warn(
          `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
          true
        )
      }
      el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) { // 不是template也能拿到slotScope
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
        warn(
          `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
          true
        )
      }
      el.slotScope = slotScope
    }
    const slotTarget = getBindingAttr(el, 'slot') // 获取slot绑定的值
    // <h1 slot='header'>{{title}}</h1> slotTarget = slot
    if (slotTarget) {
      el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget // 如果是空就赋值default
      // preserve slot as an attribute for native shadow DOM compat
      // only for non-scoped slots.
      if (el.tag !== 'template' && !el.slotScope) {
        addAttr(el, 'slot', slotTarget) // 在el上加上slot属性
      }
    }
  }
}

function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

function processAttrs (el) {
  // 处理v-on v-bind v-model v-text v-html 以及其他一些属性
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, isProp
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    if (dirRE.test(name)) { // @ v-
      // mark element as dynamic
      el.hasBindings = true // 动态节点
      // modifiers
      modifiers = parseModifiers(name) // 有没有click.stop这种 ,处理修饰符
      // modifiers:{
      //  native:true,
      //  prevent:true
      // }
      if (modifiers) { // 如果有modifiers，就把修饰符去了
        name = name.replace(modifierRE, '')
      }
      if (bindRE.test(name)) { // v-bind
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isProp = false
        if (modifiers) {
          if (modifiers.prop) {
            isProp = true
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            addHandler(
              el,
              `update:${camelize(name)}`,
              genAssignmentCode(value, `$event`)
            )
          }
        }
        if (isProp || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value)
        } else {
          addAttr(el, name, value)
        }
      } else if (onRE.test(name)) { // v-on
        name = name.replace(onRE, '') // 去除了@
        addHandler(el, name, value, modifiers, false, warn) // 给el添加事件属性
      } else { // normal directives
        // 有v- 不是v-if 不是v-for 不是v-on 不是 v-bind
        // v-text v-html v-model
        name = name.replace(dirRE, '') // v-model的name就是model
        // parse arg
        const argMatch = name.match(argRE)
        const arg = argMatch && argMatch[1]
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
        }
        addDirective(el, name, rawName, value, arg, modifiers) // 把参数放入el.directives数组中
        if (process.env.NODE_ENV !== 'production' && name === 'model') { // 非生产的v-model会走这个逻辑
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.'
          )
        }
      }
      addAttr(el, name, JSON.stringify(value))
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true')
      }
    }
  }
}

function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

function makeAttrsMap (attrs: Array<Object>): Object { // 将attrs转为{name:value}形式
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name)
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) { // v-mode不能和v-for一起使用
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`
      )
    }
    _el = _el.parent
  }
}
